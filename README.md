# WynLife Church Website

Official website for **WynLife Church** — a vibrant, multicultural Christian community in Wyndham Vale, Melbourne's west.

🌐 **Live site:** [https://yourusername.github.io/your-repo-name](https://yourusername.github.io/your-repo-name)
📍 **208 Ballan Rd, Wyndham Vale VIC 3024**
📞 **+61 457 697 354**
✉️ **info@wynlife.com.au**

---

## Pages

| File | Page |
|---|---|
| `index.html` | Home |
| `gatherings.html` | Gatherings |
| `church-online.html` | Church Online |
| `whats-on.html` | What's On |
| `next-steps.html` | Next Steps |
| `about.html` | About |
| `pray.html` | Let Us Pray For You (Contact) |

---

## Project Structure

```
wynlife-church/
├── index.html
├── gatherings.html
├── church-online.html
├── whats-on.html
├── next-steps.html
├── about.html
├── pray.html
├── style.css              # Global stylesheet
├── nav.js                 # Shared navigation + footer (injected on every page)
├── README.md
└── assets/
    ├── shared/            # Logo, favicon, hero video (used on all pages)
    │   ├── Wynlife_Header_Logo.avif
    │   ├── Favicon_Logo.png
    │   └── Landing_Page_Video.mp4
    ├── home/              # Home page images
    ├── gatherings/        # Gatherings page images
    ├── church-online/     # Church Online page images
    ├── whats-on/          # What's On page images
    ├── next-steps/        # Next Steps page images
    ├── about/             # About page images (incl. head_pastor.JPG)
    └── pray/              # Contact / Prayer page images
```

---

## Tech Stack

This is a **pure static website** — no frameworks, no build tools, no dependencies.

- **HTML5** — one file per page
- **CSS3** — single shared `style.css` with CSS variables for theming
- **Vanilla JavaScript** — `nav.js` injects the shared nav and footer into every page at runtime
- **Google Fonts** — Merriweather (headings) + Lato (body)
- **YouTube embed** — click-to-play on Church Online page
- **mailto: form** — the contact form on `pray.html` opens the visitor's email client with details pre-filled to `info@wynlife.com.au`

---

## Hosting (GitHub Pages)

This site is hosted via **GitHub Pages**.

To enable or re-enable it:
1. Go to **Settings → Pages**
2. Set Source to **Branch: `main`**, Folder: **`/ (root)`**
3. Click **Save**
4. The site will be live at `https://yourusername.github.io/your-repo-name/`

### Custom Domain
To use `www.wynlife.com.au`:
1. Go to **Settings → Pages → Custom domain**
2. Enter `www.wynlife.com.au` and click Save
3. Update your DNS records with your domain registrar to point to GitHub Pages

---

## Making Updates

### Updating text content
Open the relevant `.html` file and edit the text directly. Commit and push — changes go live within ~1 minute.

### Replacing an image
1. Add the new image to the correct subfolder inside `assets/` (e.g. `assets/about/head_pastor.JPG`)
2. Make sure the filename matches exactly what is referenced in the HTML
3. Commit and push

### Adding a new announcement (What's On)
Open `whats-on.html` and add a new two-column block inside the `#announcements` section, following the same pattern as the existing ones.

### Updating service times or contact details
- **Service times strip** — edit the `.service-strip` block in `index.html`
- **Footer contact details** — edit the `FOOTER_HTML` string in `nav.js`
- **Contact page details** — edit the info rows in `pray.html`

---

## Social Links

| Platform | URL |
|---|---|
| Facebook | [facebook.com/wynlifechurch.au](https://www.facebook.com/wynlifechurch.au) |
| YouTube | [youtube.com/@wynlifechurch](https://www.youtube.com/@wynlifechurch) |
| Instagram | [instagram.com/wynlifechurch](http://instagram.com/wynlifechurch) |

---

**Colour palette:**

| Name | Hex |
|---|---|
| Navy | `#1a2744` |
| Blue | `#2563a8` |
| Gold (accent) | `#b8860b` |
| Cream | `#f8f7f4` |

---

*Website built and maintained for WynLife Church, Wyndham Vale VIC 3024.*
