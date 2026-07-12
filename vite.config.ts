import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Obfuscates the production bundle only (dev builds are untouched, so
    // this never slows down local iteration or breaks readable stack
    // traces while developing). Raises the bar against casual copying —
    // it does not and cannot make the bundle un-readable to a determined
    // person, since anything shipped to a browser is inherently public.
    obfuscator({
      apply: 'build',
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.3,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        splitStrings: true,
        splitStringsChunkLength: 8,
        // Off: fragile in practice (throws in some embed/iframe contexts,
        // breaks source-map-free error reporting) for a marginal deterrence gain.
        selfDefending: false,
        disableConsoleOutput: false,
      },
    }),
  ],
})
