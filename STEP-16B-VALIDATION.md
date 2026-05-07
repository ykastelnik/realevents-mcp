# Step 16b — Validation manuelle Claude Desktop

Objectif : confirmer que Claude lit correctement les descriptions des 6 tools et choisit le bon en réponse à des prompts en langage naturel. Step 16a a déjà validé que les 6 tools fonctionnent en JSON-RPC contre la prod ; cette étape couvre uniquement le routage LLM.

## 1. Config Claude Desktop

Édite `~/Library/Application Support/Claude/claude_desktop_config.json` et ajoute la section `realevents-local` au bloc `mcpServers` (crée la clé si elle n'existe pas) :

```json
{
  "mcpServers": {
    "realevents-local": {
      "command": "node",
      "args": ["/Users/kastelnik/projects/realevents-mcp/dist/index.js"],
      "env": {
        "REALEVENTS_API_URL": "https://realevents.co/api/v1"
      }
    }
  }
}
```

Note : pas de `REALEVENTS_MANAGE_TOKEN` ici. Pour les prompts qui en ont besoin (P7, P8), Claude doit demander le token explicitement ou tu le colles dans le prompt. Si tu veux automatiser, ajoute une seconde entrée `realevents-mcp-with-token` avec le token de l'event que tu vas créer en P5.

Quitte complètement Claude Desktop (Cmd+Q, pas juste fermer la fenêtre) et relance-le. L'icône de paramètres en bas du chat doit lister `realevents-local` avec 6 tools.

## 2. Les 8 prompts (copy-paste)

Pour chaque prompt, vérifie :
- Claude appelle le bon tool (visible dans le panneau outils, ou via "Show details")
- La réponse contient ce qui est attendu (cf colonne "Doit retourner")

### Lecture seule

**P1.** `Show me upcoming events on RealEvents`
Doit retourner : liste de 2 events (33 and glowing, Slow Roll). Tool : `list_public_events`.

**P2.** `Are there any tech events coming up on RealEvents?`
Doit retourner : "No events found matching your filters." Tool : `list_public_events` avec `search: "tech"`.

**P3.** `Show me virtual events this week on RealEvents`
Doit retourner : "No events found matching your filters." Tool : `list_public_events` avec `format: "virtual"`, `date: "this_week"`.

**P4.** `Get the details of the realevents-mcp-smoke-test event on RealEvents`
Doit retourner : titre "RealEvents MCP smoke test", date 2099, status published. Tool : `get_event`.

### Écriture (créent ou modifient des données prod)

**P5.** `Create an event on RealEvents called "MCP smoke validation 16b" for December 30, 2099 at 7pm UTC, virtual, with description "Created during step 16b Claude Desktop validation."`
Doit retourner : un public link et un manage link. **Note bien le manage_token retourné, tu en as besoin pour P7 et P8.** Tool : `create_event`.

**P6.** `Register mcp-smoke-16b@realevents.co for the event "mcp-smoke-validation-16b" on RealEvents`
Doit retourner : confirmation d'inscription, status confirmed. Tool : `register_for_event`.

**P7.** `Update the location of my event with manage token <COLLER_LE_TOKEN_DE_P5> to "Updated via Claude Desktop"`
Doit retourner : "Event updated successfully", "Updated fields: location". Tool : `update_event`.

**P8.** `Show me the details and registrations of my event using manage token <COLLER_LE_TOKEN_DE_P5>`
Doit retourner : manage view + 1 registration (mcp-smoke-16b@realevents.co). Tool : `get_manage_event`.

### Cleanup (optionnel mais recommandé)

`Cancel my event with manage token <COLLER_LE_TOKEN_DE_P5>`
Tool : `update_event` avec `status: "cancelled"`. Évite de laisser un event traîner en prod.

## 3. Compte-rendu attendu

Pour chaque prompt, note :
- Tool effectivement appelé (Claude le montre dans la UI)
- Tool attendu (cf liste ci-dessus)
- OK / KO

Si KO sur un prompt → la description du tool concerné est ambiguë, à reformuler avant publish.

## 4. Risques connus

- **P1 vs P3** : Claude peut hésiter entre `list_public_events` sans filtre et avec `date: "this_week"`. Acceptable si la réponse contient bien les events visibles.
- **P5** : si Claude met une mauvaise timezone dans `start_datetime` (passe `2099-12-30T19:00:00` au lieu de `2099-12-30T19:00:00Z`), l'event sera créé avec heure locale serveur. Pas un bug du MCP, juste un comportement à observer.
- **P7 / P8** : si tu n'as pas mis le token dans la config env, Claude doit te demander le token. S'il essaie de deviner ou inventer, c'est un signal qu'on devrait surfacer plus clairement la nécessité du token dans la description du tool.
