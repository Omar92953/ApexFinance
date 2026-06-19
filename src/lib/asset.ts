// Resolve a public asset against the Vite base path so it works both on
// localhost ('/') and GitHub Pages ('/ApexFinance/').
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;
