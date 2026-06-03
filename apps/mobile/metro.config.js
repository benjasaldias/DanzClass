const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const mobileNodeModules = path.resolve(__dirname, 'node_modules')
// Root-level assets shared across the monorepo (icons, splash, etc.)
const repoAssetsDir = path.resolve(__dirname, '../../assets')

const config = getDefaultConfig(__dirname)
// Allow Metro to bundle files from the shared root assets directory
config.watchFolders = [...(config.watchFolders ?? []), repoAssetsDir]
const nativeWindConfig = withNativeWind(config, { input: './global.css' })

// react-native@0.81.5 uses React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
// which only exists in React 19. The monorepo root has React 18 (hoisted for apps/web),
// so we must intercept all 'react' resolutions to use apps/mobile/node_modules (React 19).
const originalResolveRequest = nativeWindConfig.resolver?.resolveRequest

nativeWindConfig.resolver = {
  ...nativeWindConfig.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === 'react' || moduleName.startsWith('react/')) {
      try {
        const resolved = require.resolve(moduleName, { paths: [mobileNodeModules] })
        return { filePath: resolved, type: 'sourceFile' }
      } catch (_) {}
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform)
    }
    return context.resolveRequest(context, moduleName, platform)
  },
}

module.exports = nativeWindConfig
