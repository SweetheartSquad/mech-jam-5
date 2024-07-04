# js-walkaround-template

![icon](./public/assets/icon.png)

## Development

```sh
npm i # installs dependencies
npm start # starts dev server
npm run build # creates production build
```

Hot-reload is available for:

- textures
- audio
- [`./public/assets/main-en.strand`](./public/assets/main-en.strand), which allows you to interactively edit passages

## Release

1. Bump the package version (`npm version patch/minor/major`)
2. Push changes
3. Go to [release action](https://github.com/USERNAME/REPO/actions/workflows/release.yml)
4. Select "Run workflow", and confirm on `main` branch

The workflow will automatically create a build and upload it to itch.io.
