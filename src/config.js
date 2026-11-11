// Ponto central para adaptar o recurso/permissões na prova.
export const config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || "dev-1vbhhb524hr3h5zd.us.auth0.com",
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || "1EErawNITNj7bN6GLUMuMkMzvWOR2tRq",
  audience: import.meta.env.VITE_AUTH0_AUDIENCE || "https://api-avaliacoes",
  endpoint: "/api/itens",
  readPermission: "read:itens",
  writePermission: "write:itens",
};
