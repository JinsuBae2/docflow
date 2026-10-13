module.exports = {
  outDir: 'dist',
  packagerConfig: { asar: true, extraResource: ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'node_modules/electron/dist/LICENSES.chromium.html'], executableName: 'docflow', ignore: [/^\/src/, /^\/tests/, /^\/work/, /^\/outputs/, /^\/dist/, /^\/\.github/, /^\/\.git/] },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32', 'linux'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'docflow', authors: 'Docflow contributors', description: 'Visual document workspace' } }
  ]
};
