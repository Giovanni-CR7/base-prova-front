import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { config } from "./config.js";

const VAZIO = { titulo: "", descricao: "", descricao: "" };
const FILTROS = { busca: "", descricao: "", ordem: "recentes" };
const PAGINA_VAZIA = { content: [], totalElements: 0, totalPages: 0, number: 0 };

function permissoesDoToken(token) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(payload.permissions) ? payload.permissions : [];
  } catch { return []; }
}

function formatarData(valor) {
  if (!valor) return "—";
  return new Date(`${valor}Z`).toLocaleString("pt-BR");
}

export default function App() {
  const { loginWithRedirect, logout, user, isAuthenticated, isLoading, error: erroAuth, getAccessTokenSilently } = useAuth0();
  const [permissoes, setPermissoes] = useState(null);
  const [dados, setDados] = useState(PAGINA_VAZIA);
  const [filtros, setFiltros] = useState(FILTROS);
  const [aplicados, setAplicados] = useState(FILTROS);
  const [pagina, setPagina] = useState(0);
  const [revisao, setRevisao] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const podeEscrever = permissoes?.includes(config.writePermission) ?? false;

  const chamar = useCallback(async (metodo, caminho = "", corpo, sinal) => {
    const token = await getAccessTokenSilently();
    const controller = new AbortController();
    const cancelar = () => controller.abort();
    if (sinal?.aborted) controller.abort();
    sinal?.addEventListener("abort", cancelar, { once: true });
    let expirou = false;
    const timer = setTimeout(() => { expirou = true; controller.abort(); }, 20000);
    try {
      const response = await fetch(`${config.endpoint}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detalhe = null;
        try { detalhe = await response.json(); } catch { /* Resposta pode não ser JSON. */ }
        const mensagens = {
          401: "Sessão inválida ou token rejeitado. Saia e entre novamente.",
          403: "Seu usuário não tem permissão para esta ação.",
          404: "artigo não encontrada. Atualize a lista.",
          502: "A API está inacessível. Confira o container e a porta 8081.",
          503: "A API está indisponível.",
          504: "O servidor demorou para responder.",
        };
        const campos = detalhe?.campos ? Object.entries(detalhe.campos).map(([campo, texto]) => `${campo}: ${texto}`).join("; ") : "";
        throw new Error(mensagens[response.status] || campos || detalhe?.mensagem || `Erro HTTP ${response.status}.`);
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      if (expirou) throw new Error("A requisição excedeu 20 segundos. Confira o resultado antes de repetir uma gravação.");
      if (error instanceof TypeError) throw new Error("Não foi possível conectar à API. Confira a rede e o proxy.");
      throw error;
    } finally {
      clearTimeout(timer);
      sinal?.removeEventListener("abort", cancelar);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let ativo = true;
    getAccessTokenSilently().then(token => {
      if (ativo) setPermissoes(permissoesDoToken(token));
    }).catch(error => { if (ativo) setErroLista(error.message); });
    return () => { ativo = false; };
  }, [isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ ...aplicados, pagina: String(pagina), tamanho: "8" });
    setCarregando(true);
    setErroLista("");
    chamar("GET", `?${params}`, undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.content)) throw new Error("A resposta da API não corresponde ao formato de página esperado.");
        if (pagina > 0 && result.totalPages <= pagina) {
          setPagina(Math.max(0, result.totalPages - 1));
          return;
        }
        setDados(result);
      })
      .catch(error => {
        if (!controller.signal.aborted) { setErroLista(error.message); setDados(PAGINA_VAZIA); }
      })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [isAuthenticated, aplicados, pagina, revisao, chamar]);

  async function salvar(event) {
    event.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await chamar(editando === null ? "POST" : "PUT", editando === null ? "" : `/${editando}`, form);
      setMensagem({ tipo: "ok", texto: editando === null ? "artigo criada." : "artigo atualizada." });
      setForm(VAZIO); setEditando(null); setRevisao(v => v + 1);
    } catch (error) { setMensagem({ tipo: "erro", texto: error.message }); }
    finally { setSalvando(false); }
  }

  function editar(item) {
    setForm({ titulo: item.titulo, descricao: item.descricao, descricao: item.descricao });
    setEditando(item.id); setMensagem(null);
    document.getElementById("titulo")?.focus();
    document.getElementById("editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function excluir(item) {
    if (excluindo !== null || !window.confirm(`Excluir definitivamente “${item.titulo}”?`)) return;
    setExcluindo(item.id); setMensagem(null);
    try {
      await chamar("DELETE", `/${item.id}`);
      if (editando === item.id) { setEditando(null); setForm(VAZIO); }
      setMensagem({ tipo: "ok", texto: "artigo excluída." }); setRevisao(v => v + 1);
    } catch (error) { setMensagem({ tipo: "erro", texto: error.message }); }
    finally { setExcluindo(null); }
  }

  if (isLoading) return <main className="estado">Carregando autenticação…</main>;
  if (erroAuth) return <main className="estado"><h1>Não foi possível entrar</h1><p role="alert">{erroAuth.message}</p><button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Voltar ao início</button></main>;
  if (!isAuthenticated) return <main className="entrada"><span className="marca">/ PROVA</span><h1>Publique ideias.<br/>Consulte conteúdos.</h1><p>Uma base simples para criar, organizar e visualizar Artigos com acesso por perfil.</p><button onClick={() => loginWithRedirect()}>Entrar com minha conta</button><small>Autenticação com Auth0 · API Spring Boot</small></main>;

  return <div className="layout">
    <header className="topo"><div><span className="marca"> / PROVA</span><h1>Artigos</h1></div><div className="conta"><span>{user?.email || user?.name}</span><span className="perfil">{permissoes === null ? "Verificando acesso…" : podeEscrever ? "Gerenciamento" : "Consulta"}</span><button className="secundario" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Sair</button></div></header>
    {mensagem && <div role="status" className={`aviso ${mensagem.tipo}`}>{mensagem.texto}</div>}
    {permissoes !== null && !permissoes.includes(config.readPermission) && <div className="aviso erro">Seu token não contém {config.readPermission}. Confira as permissões do papel na API correta do Auth0 e entre novamente.</div>}
    <div className={podeEscrever ? "colunas" : "colunas consulta"}>
      {podeEscrever && <aside id="editor" className="painel editor"><h2>{editando === null ? "Novo artigo" : `Editar artigo #${editando}`}</h2><p className="muted">Título, conteúdo e descricao são os campos da base.</p>
        <form onSubmit={salvar}><fieldset disabled={salvando || excluindo !== null}>
          <label htmlFor="titulo">Título</label><input id="titulo" required maxLength={160} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}/>
          <label htmlFor="descricao">Conteúdo</label><textarea id="descricao" required maxLength={5000} rows={7} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}/>
          <label htmlFor="descricao">descricao</label><input id="descricao" required maxLength={80} placeholder="Ex.: Geral" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}/>
          <div className="acoes"><button type="submit">{salvando ? "Salvando…" : editando === null ? "Publicar" : "Salvar alterações"}</button>{editando !== null && <button type="button" className="secundario" onClick={() => { setEditando(null); setForm(VAZIO); }}>Cancelar</button>}</div>
        </fieldset></form></aside>}
      <section className="listagem"><div className="cabecalho-lista"><div><h2>Conteúdos publicados</h2><p className="muted">{dados.totalElements} {dados.totalElements === 1 ? "artigo" : "Artigos"}</p></div><button className="secundario" disabled={carregando} onClick={() => setRevisao(v => v + 1)}>Atualizar</button></div>
        <form className="painel filtros" onSubmit={e => { e.preventDefault(); setPagina(0); setAplicados({ ...filtros }); }}>
          <div><label htmlFor="busca">Buscar no título ou conteúdo</label><input id="busca" maxLength={160} placeholder="Digite um termo" value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })}/></div>
          <div><label htmlFor="filtroDescricao">Descricao exata</label><input id="filtroDescricao" maxLength={80} placeholder="Todas" value={filtros.descricao} onChange={e => setFiltros({ ...filtros, descricao: e.target.value })}/></div>
          <div><label htmlFor="ordem">Ordenação</label><select id="ordem" value={filtros.ordem} onChange={e => setFiltros({ ...filtros, ordem: e.target.value })}><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option><option value="titulo">Título A–Z</option></select></div>
          <div className="acoes"><button type="submit">Filtrar</button><button type="button" className="secundario" onClick={() => { setFiltros({ ...FILTROS }); setAplicados({ ...FILTROS }); setPagina(0); }}>Limpar</button></div>
        </form>
        {erroLista && <div role="alert" className="aviso erro">{erroLista}</div>}
        {carregando ? <div role="status" className="vazio">Carregando Artigos…</div> : !erroLista && dados.content.length === 0 ? <div className="painel vazio"><h3>Nenhuma artigo encontrada</h3><p>{podeEscrever ? "Crie uma artigo ou ajuste os filtros." : "Ajuste os filtros ou aguarde novas Artigos."}</p></div> : !erroLista && <div className="cards">{dados.content.map(item => <article className="painel card" key={item.id}><span className="descricao">{item.descricao}</span><h3>{item.titulo}</h3><p className="descricao">{item.descricao}</p><footer><small>Criado em {formatarData(item.criadoEm)}<br/>Atualizado em {formatarData(item.atualizadoEm)}</small>{podeEscrever && <div className="acoes"><button className="secundario" disabled={salvando || excluindo !== null} onClick={() => editar(item)}>Editar</button><button className="perigo" disabled={salvando || excluindo !== null} onClick={() => excluir(item)}>{excluindo === item.id ? "Excluindo…" : "Excluir"}</button></div>}</footer></article>)}</div>}
        {!erroLista && dados.totalPages > 0 && <nav className="paginacao" aria-label="Paginação"><button className="secundario" disabled={pagina === 0 || carregando} onClick={() => setPagina(v => v - 1)}>Anterior</button><span>Página {pagina + 1} de {dados.totalPages}</span><button className="secundario" disabled={pagina + 1 >= dados.totalPages || carregando} onClick={() => setPagina(v => v + 1)}>Próxima</button></nav>}
      </section>
    </div><footer className="rodape">Base adaptável · autorização aplicada pela API · dados persistidos no PostgreSQL</footer>
  </div>;
}
