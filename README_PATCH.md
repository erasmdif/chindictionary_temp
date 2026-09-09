# CHIND Documentation — GitHub Pages image base-path fix

## Cosa corregge

La Documentation usava percorsi assoluti `/images/...` per gli screenshot. Su GitHub Project Pages questi percorsi puntano alla root dell'account invece che al `BASE_URL` del progetto, producendo 404.

La patch fa passare tutti gli asset della pagina Documentation attraverso il helper CHIND `withBase()` già presente nel progetto.

Esempio:

- locale: `/images/chind/documentation/dictionary-page.png`
- GitHub Project Page: `/chindictionary_temp/images/chind/documentation/dictionary-page.png` (o il base configurato nel build)
- custom domain/root: `/images/chind/documentation/dictionary-page.png`

Corregge anche il favicon della pagina Documentation.

## File modificato

- `usr/pages/documentation.astro`

Nessuna modifica a `core/**`, Directus, endpoint o configurazione s:CMS.
