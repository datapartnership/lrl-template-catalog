# Language Data Trust website template

The Trust front end template is a static, no-build website for a licensed language data catalog. It lets people browse collections and see a few sample files, explains how access works for researchers and commercial subscribers, and documents the API. The data itself is delivered through the API, not from this site. It is plain HTML, CSS and JavaScript, so it can be hosted anywhere, including GitHub Pages.

It is based on the [lrl-catalog](https://github.com/datapartnership/lrl-catalog) prototype, with a new serif design and a front end that reads from the catalog API instead of CSV files.

## Try it in a minute

The template runs on its own in **sample mode**, with no server or account needed. The sample data is the catalog's real content: 20 providers and 200 collections of Malawian language audio, video and text.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

A banner reminds you that sample data is showing. It disappears once you connect an API.

## Connect it to your API

Edit [`js/config.js`](js/config.js). Set the base URL of your catalog API:

```js
apiBaseUrl: "https://api.example.org",
```

Leave `apiBaseUrl` empty, or set `useSampleData: true`, to go back to sample mode.

**Your API must allow this site's address in its cross-origin (CORS) settings**, for example `Cors:AllowedOrigins` on the backend. Without it, browsers block every request and the catalog shows a "could not be reached" message.

### What the template expects from the API

| Screen | Request |
|---|---|
| Browse and filters | `GET /api/catalog/collections` with `page`, `pageSize`, `search`, `language`, `mediaType`, `provider`, `theme` |
| Filter menus | `GET /api/catalog/collections/facets` |
| Collection details | `GET /api/catalog/collections/{id}` |
| Sample files (the first five) | `GET /api/catalog/collections/{id}/files` with `page`, `pageSize` |
| Researcher application (optional) | `POST /api/applications` |

Errors are turned into plain messages. The collection pages only read public catalog data. File downloads, bundles and the Croissant query are documented on the API tab for people to call themselves.

### How the template's fields match the API

The catalog API is the source of truth. The template reads the API's own field names and keeps every field it can show. The table below lists each field, where the template uses it, and where it comes from in the documented API.

| Field | Used for | API source | Status |
|---|---|---|---|
| Collection `id` | Links and API calls | `Id` | In the API |
| Collection `name` | Card and page titles | No title field is documented. The template uses a `name` or `title` if the API returns one, and otherwise the collection's folder name from `StoragePrefix` | **Optional addition** |
| Collection `description` | Card text and provider tables | Not in the documented data model | **Optional addition** |
| `provider` | Card, filter, Providers tab | `Provider` | In the API |
| `language` | Card, filter | `LanguageCode`. This is a code such as `sw`, and the template shows the language name | In the API |
| `mediaType` | Card, filter, table | `MediaType` (`Text`, `Audio`, `Video`) | In the API |
| `fileCount` | Card and details | `FileCount` | In the API |
| Duration (hours) | Card and details | `TotalDurationSeconds`, for audio and video | In the API |
| Years | Card and details | The collection's temporal coverage in the Croissant metadata, as an interval such as `2022-01-01/2025-12-31`. The template also accepts `yearStart` and `yearEnd` | In the API (property name `temporalCoverage` assumed) |
| `themes` | Card chips and filter | Themes come from tagging. They are stored per file, with collection-level tags aggregated (up to 20), and the facets include `theme` | In the API (the collection-level property name is not documented) |
| `license`, `creator`, `publisher`, `sourceOrganization` | Details | `License`, `Creator`, `Publisher`, `SourceOrganization` | In the API |
| `piiScreening`, `sensitiveContent` | Details | `PiiScreening`, `SensitiveContent` | In the API |
| File `id`, `kind`, `format`, `words`, `seconds` | Sample file list | `Id`, `Kind`, `EncodingFormat`, `WordCount`, `Duration` | In the API |
| File name | Sample file list | The title from tagging for text files, otherwise the last part of `ContentUrl` | In the API |
| Filters: `language`, `mediaType`, `provider`, `theme` | Browse | Indexed query paths in the API | In the API |
| Filter: `search` (free text) | Browse | No free-text search is documented | **Optional addition** |
| Paging: `page`, `pageSize` | Browse and tables | The list is paged, but the parameter names are not documented | Check against Swagger |
| Provider `type` and `description` | Providers tab | The API returns provider names only | **Optional addition** |
| Application fields (8) | Access form | `FirstName`, `LastName`, `Organization`, `OrganizationEmail`, `JobTitle`, `ProjectDescription`, `EthicalDataHandling`, `OpenSourceCommitment` | In the API |

**Optional additions.** The template keeps these fields and works without them. Adding them to the API would remove the workarounds:

- **Collection title.** Return a human-readable `name` for each collection. Until then the template shows the storage folder name.
- **Collection description.** Return a short `description`. The Croissant sidecar for audio and video collections already has one, but text collections have no sidecar.
- **Free-text search.** Accept a `search` parameter on the collection list, matching titles and descriptions.
- **Provider details.** Add an endpoint such as `GET /api/catalog/providers` returning each provider's name, type and description. Until then the template reads them from `sample-data/providers.json`.
- **Year range.** Return the collection's start and end year, or document the temporal coverage property in the list response.

The names of parameters and response fields are kept in one place, so changes are easy. Parameter names are in `js/config.js` (`paging` and `filters`). Response field names are in the "Contract" section at the top of `js/api.js`, which accepts several common spellings and either a plain array or an envelope like `{ items, total, page, pageSize }`. Check both against your API's Swagger page.

## Sign-in (optional)

People get data by calling the API with their own token, so the pages do not need sign-in. The sign-in code (`js/auth.js`) is included for sites that want a signed-in area, and it stays off, with no button shown, until you fill in `auth` in `js/config.js`. The current pages do not use the token.

It uses OpenID Connect with the authorization code flow and PKCE, so it works with Microsoft Entra ID, Keycloak and other standard providers, and needs no client secret.

1. Register a **public** client (single-page application) in your identity provider.
2. Add this site's address as a redirect URI.
3. Fill in `authority` and `clientId` under `auth` in `js/config.js`.

## Applications for access

Access terms differ by user group. The legal documents are the source of truth, and the Access tab only summarizes them.

- **Researchers** commit to ethical data handling and to open publication of derived work.
- **Commercial subscribers** agree to commercial terms through a separate application form.

In `js/config.js`, set `applications.mode` to:

- `"link"` to send both groups to your own forms (`researcherFormUrl`, `subscriberFormUrl`), or
- `"api"` to show the researcher form on this site and post it to `POST /api/applications`. Commercial subscribers always use their own form.

Update `legalDocs` with links to your real legal documents.

## Themes

The template comes with three looks. The developer picks one, and visitors see no switch.

- **Classic** is the default: a warm serif design with a dark mode that follows the visitor's system setting.
- **Continent** is modern and formal: a white page, a dark header and footer, a clean sans-serif, and terracotta, green and ochre accents.
- **Light** is bright and colorful on white, with a clean sans-serif, strong contrast, rounded cards and colored accents.

Set `theme` in `js/config.js` to `"classic"`, `"continent"` or `"light"`. To make your own, copy one of the `:root[data-palette="..."]` blocks at the end of `css/style.css`, give it a new name, and set that name as the `theme`.

## Make it yours

| To change | Edit |
|---|---|
| Title, tagline, organization, contact | `js/config.js` |
| Colors | The custom properties at the top of `css/style.css` for the Classic theme (a dark mode is included), and the theme blocks at the end of the file for the others |
| Typefaces | `--serif` in `css/style.css`. The default is a system serif stack, so nothing is downloaded. |
| Provider descriptions | `sample-data/providers.json`, or point `providersUrl` elsewhere. The API returns provider names only. |
| Access, License, API, Metadata and About wording | The files in `pages/` (plain HTML) |
| Sample data | `sample-data/collections.json` and `providers.json` (used only in sample mode). They hold the catalog's real content, converted to the API's field names: 20 providers and 200 collections. |
| Language names | `languageNames` in `js/config.js` |

## Files

```
index.html          Page frame, Browse and Providers
pages/              Wording of the Access, License, API, Metadata and About pages
metadata-docs/      Metadata schemas and example record linked from the Metadata page
css/style.css       Serif theme (all styles)
js/config.js        Settings you edit
js/api.js           API client, sample mode, and field mapping
js/auth.js          Optional sign-in (OpenID Connect with PKCE)
js/app.js           Page behavior
sample-data/        Sample collections and providers
```

## Publish on GitHub Pages

The template is plain files with no build step and only relative links, so GitHub Pages can serve it as it is. It has been tested from a sub-path such as `/lrl-template-catalog/`, which is how a project site is served.

1. In the repository, open **Settings, then Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the **main** branch and the **/ (root)** folder, then save.
4. After a minute or two the site is live. For this organization the address is `https://datapartnership.org/lrl-template-catalog/`.

The `.nojekyll` file is already included, which stops GitHub from processing the files.

When the site is live, also:

- Set `apiBaseUrl` in `js/config.js` and commit it.
- Add the site's address (for example `https://datapartnership.org`) to the API's allowed origins (CORS).
- If you use sign-in, add the site's address as a redirect URI in your identity provider.

Any other static host works the same way: copy the folder and serve it.

## Security notes

- Never put an API key or other secret in these files. Anything in a web page can be read by visitors. Browsing needs no credentials, and content requests through the API use each user's own token.
- Text from the API is always inserted as plain text, never as HTML.
- If you add pages or scripts, keep that rule.

## Differences from the prototype

- Data comes from the API instead of CSV files, so there is no build script.
- Filtering and paging are done by the API.
- Collection pages show a few labeled sample files and the API calls for the real data, instead of download buttons.
- Collection genre (radio, news, books, surveys) is gone, because the API's media types are Text, Audio and Video.
- The API reference describes the current catalog API. The old Python SDK and API-key instructions are removed.
- The Metadata page is kept, with the prototype's schema documents in `metadata-docs/`. Swap in your own.
- The License page is a placeholder. The prototype's legal text is not included.

## License

MIT. See [LICENSE](LICENSE).
