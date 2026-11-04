# Blog Builder installer

Installs and updates [Blog Builder](https://github.com/pobren/blog-builder), a free, open-source blog, on your own Cloudflare account. Your posts, pictures and readers stay on your account, and nothing depends on anyone else to keep running.

```sh
npx @mrpwob/blog-builder setup     # install
npx @mrpwob/blog-builder@latest update    # update to the newest version
npx @mrpwob/blog-builder help      # every option, and the token permissions
```

You need [Node.js](https://nodejs.org) 20 or later and a Cloudflare API token. Make the token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) (Create Token, then Create Custom Token) with the permissions `help` lists. Set it as `CLOUDFLARE_API_TOKEN`, or paste it when asked. It's only ever sent to Cloudflare.

The installer makes the blog's database (D1), picture storage (R2) and sign-in storage (KV), uploads the blog, gives it its web address and hands you a one-time link to make your admin account. Running it again is safe: anything already there is kept.

Found a bug? Please [open an issue](https://github.com/pobren/blog-builder/issues). Questions go in [Discussions](https://github.com/pobren/blog-builder/discussions).

GNU AGPL 3.0. Free to use, change and run yourself. Hosting it for others or selling it without sharing your changes needs a commercial licence: get in touch at [paulobrien.dev/contact](https://paulobrien.dev/contact/). Built on [EmDash](https://github.com/emdash-cms/emdash). Blog Builder is independent and isn't made, endorsed or supported by Cloudflare.
