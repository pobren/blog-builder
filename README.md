<div align="center">
  <img src="overlay/public/builder/logo.svg" width="64" height="64" alt="">
  <h1>Blog Builder</h1>
  <p><strong>A free, open-source blog that runs on your own Cloudflare account.</strong><br>
  16 themes, a newsletter sign-up, a contact form and easy moves from WordPress and Ghost.</p>
  <p><a href="https://paulobrien.dev/blog/">Website</a> · <a href="#install">Install</a> · <a href="https://github.com/pobren/blog-builder/releases">Releases</a> · <a href="https://github.com/pobren/blog-builder/issues">Report a bug</a> · <a href="https://github.com/pobren/blog-builder/discussions">Ask a question</a></p>
</div>

Blog Builder is [EmDash](https://github.com/emdash-cms/emdash), the open-source blogging software, with an installer, 16 themes and the plugins most blogs need already in. It installs into your own Cloudflare account, so your posts, pictures and readers stay there, and nothing depends on anyone else to keep running. Every feature is in the free app. There's nothing to unlock.

- **16 themes**, from a simple notebook to a magazine, a portfolio or a podcast. Switch any time from the admin.
- **Newsletter sign-up** under your posts, on the home page or anywhere in a post. Addresses stay in your blog; download them as a CSV file for your newsletter tool.
- **Contact form** with your own questions, kept in the admin.
- **Share buttons and social links** with no tracking scripts.
- **A post checklist** that catches a missing excerpt, picture descriptions, broken links or a missing affiliate disclosure before you publish.
- **Moving in:** import from WordPress (EmDash's own import) or a whole Ghost site, keep your old addresses working, and bring your subscribers from Mailchimp, Substack, Ghost and others.
- **Moving out:** download your whole blog as one file any time.
- **Privacy-friendly embeds:** videos and maps only load when a reader clicks.
- **IndexNow:** Bing and other search engines hear about new posts straight away.
- **Optional stats** with [ReaderCount](https://readercount.com), cookie-free.

## What you need

- A Cloudflare account. The free plan is fine.
- R2 storage switched on for the account (Cloudflare asks for a payment card once, even for the free allowance).
- A domain on that account, if you want the blog on your own address. You can try it on your free workers.dev address first.

## Install

There are three ways. All of them install into your own Cloudflare account, and updating later keeps your posts and settings.

### 1. The installer (recommended)

You need [Node.js](https://nodejs.org) 20 or later and a Cloudflare API token.

```sh
npx @mrpwob/blog-builder setup
```

`npx @mrpwob/blog-builder help` lists the token permissions. Make the token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) (Create Token, then Create Custom Token). It's only ever sent to Cloudflare.

The installer asks which domain and theme you'd like, makes the database, storage and web address, then gives you a one-time link to make your admin account. Only that link can finish the set-up, so nobody else can claim your blog first.

### 2. Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pobren/blog-builder)

The button copies Blog Builder to your GitHub account, makes its database and storage in your Cloudflare account and builds it there (the first build takes several minutes). It asks for two things:

- **THEME:** the theme to start with, such as `notebook`. You can switch later in the admin.
- **SETUP_TOKEN:** a long secret code you make up.

When it's deployed, open `https://<your blog's address>/setup-link?setup=<your code>` to make your admin account. Only someone with the code can finish the set-up. To use your own domain, open **Workers & Pages › blog-builder › Settings › Domains & Routes** and add it there.

To update later, pull the latest code into your GitHub copy (GitHub's **Sync fork**, or copy the changes over) and Cloudflare rebuilds it.

### 3. From the code

Building Blog Builder builds EmDash too, so it takes a few minutes and needs git, Node.js 22 and about 6 GB of memory.

```sh
git clone https://github.com/pobren/blog-builder.git
cd blog-builder
npm install
npm run build      # checks out EmDash at the pinned version and builds the blog
npm run package    # turns the build into the installer
npm run setup      # installs it, as above
```

Or deploy it with Wrangler instead of the installer: set the theme in `wrangler.jsonc`, put your set-up code in a `SETUP_TOKEN` secret (`npx wrangler secret put SETUP_TOKEN`), then run `npm run deploy`.

## Themes

Pick a theme when you install, then change it any time under **Plugins › Blog Builder › Settings** in your blog's admin. Your posts, pictures and settings stay as they are.

| Theme | The look | Good for |
| --- | --- | --- |
| Notebook | Clean and bright, with a featured post and post cards. | Anyone starting a blog. |
| Journal | One centred column of essays in serif type on warm paper, with nothing to distract from the words. | Writers, essayists and thought-leadership blogs. |
| Practice | Your firm's contact details beside your name, then articles as a clean, dated list. | Accountants, solicitors, consultants and advisers. |
| Local | A bold banner with a big call button and your opening hours, then your news as picture tiles. | Trades, shops, salons and cafés. |
| Studio | Your work in an even grid of pictures, each with its title underneath. | Designers, makers and creative studios. |
| Company news | A newsroom: updates grouped by month, each with its date and topic. | Businesses posting news, launches and announcements. |
| Magazine | A front page like a newspaper: a lead story, a ranked list and a section for each category. | Publishers, newsletters and blogs that post often. |
| Portfolio | Your name set huge, then your work in big pictures that fill the screen. | Designers, photographers, architects and studios. |
| SaaS | A product home page: a bold promise, a screenshot, an updates timeline and a big sign-up button. | Creators, solo founders and small software businesses. |
| Letter | A personal letter: your newest issue up front, a sign-up box at the top and numbered past issues. | Newsletter writers, columnists and personal blogs. |
| Help centre | A big search box, your topics as tiles, popular articles and a way to get in touch. | Product help, FAQs, policies and how-to guides. |
| Events | A night-time poster for your next event, date stubs on every listing and a big ticket button. | Venues, clubs, festivals and event organisers. |
| Developer | A terminal-style welcome, your newest post in a window and every post listed by year. | Developers, engineers and technical writers. |
| Gallery | A dark wall of pictures from edge to edge, with your name kept small so the work speaks. | Photographers, illustrators and artists. |
| Podcast | Your show's artwork and a play button up front, the newest episode as a big card and every episode numbered. | Podcasters and audio shows. |
| Hospitality | A full-width welcome picture, opening times, how to find you and a big booking button. | Cafés, restaurants, bars, B&Bs and venues. |

## Updating

The **Blog Builder** page in your blog's admin tells you when a new release is out. Your posts and settings are kept when you update.

- **Installer:** `npx @mrpwob/blog-builder@latest update`
- **From the code:** `git pull`, then `npm install`, `npm run build`, `npm run package` and `npm run update`

What's new in each version is in [CHANGELOG.md](CHANGELOG.md) and on the [releases page](https://github.com/pobren/blog-builder/releases).

## How it's made

Blog Builder doesn't fork EmDash. It takes EmDash's `blog-cloudflare` template at the commit pinned in [`release.json`](release.json) and:

- makes a few small changes to EmDash's own code ([`patch-emdash.mjs`](patch-emdash.mjs)), each of which fails the build if EmDash's code has moved;
- copies the files in [`overlay/`](overlay) over the template: the themes, the plugins (in `overlay/src/extras`, `overlay/src/builder-plugin` and `overlay/src/readercount-plugin`) and the pages they need.

[`scripts/build.mjs`](scripts/build.mjs) does both and builds the result. The installer is in [`installer/`](installer). `npm test` runs the tests and `npm run typecheck` checks the installer's types.

## Help

- **Found a bug?** Please [open an issue](https://github.com/pobren/blog-builder/issues), with what you did and what happened.
- **A question about installing or using it?** Ask in [Discussions](https://github.com/pobren/blog-builder/discussions), so everyone can find the answer.

Help is only given on GitHub. Blog Builder is a free project, so answers come when there's time.

## Licence and credits

Blog Builder is licensed under the [MIT License](LICENSE). It's built on [EmDash](https://github.com/emdash-cms/emdash) by Cloudflare, also under the MIT License; thank you to its authors. See [NOTICE](NOTICE).

Blog Builder is independent. It isn't made, endorsed or supported by Cloudflare.
