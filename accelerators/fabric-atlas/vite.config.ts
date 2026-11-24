//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import license from "rollup-plugin-license";
import { execSync } from "node:child_process";
import packageJson from "./package.json" with { type: "json" };

import { resolve } from 'path';
import { applyLocalNetworkAccess, parseExtraOrigins } from "./src/dev/local-network-access";

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname
const repositoryUrl = "https://github.com/fredgis/FabricAtlas";
const buildCommit =
    process.env.GITHUB_SHA?.slice(0, 7) ||
    (() => {
        try {
            return execSync("git rev-parse --short HEAD", {
                cwd: projectRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch {
            return "development";
        }
    })();

// Dev-only middleware: lets the Fabric portal embed the local Vite server under
// Local Network Access (LNA) checks. Only Fabric / Power BI portal origins (and
// ATLAS_DEV_ALLOWED_ORIGINS) receive credentialed private-network CORS headers.
// Top-level iframe navigations additionally require launching Chromium with the
// `--disable-features=...LocalNetworkAccessChecks` flag (see .playwright-config.json
// and docs/local-development.md).
const extraDevOrigins = parseExtraOrigins(process.env.ATLAS_DEV_ALLOWED_ORIGINS);
const localNetworkAccessPlugin: PluginOption = {
  name: 'local-network-access-headers',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (applyLocalNetworkAccess(req, res, extraDevOrigins)) return;
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
    define: {
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
        "import.meta.env.VITE_APP_REPOSITORY_URL": JSON.stringify(repositoryUrl),
        "import.meta.env.VITE_APP_BUILD_COMMIT": JSON.stringify(buildCommit),
        "import.meta.env.VITE_APP_BUILD_DATE": JSON.stringify(new Date().toISOString()),
    },
    plugins: [
        react(),
        tailwindcss(),
        localNetworkAccessPlugin,
    ],
    resolve: {
        alias: {
            '@': resolve(projectRoot, 'src'),
        }
    },
    build: {
        commonjsOptions: {
            include: [/node_modules/],
        },
        rollupOptions: {
            plugins: [
                license({
                    thirdParty: {
                        multipleVersions: true,
                        output: {
                            file: resolve(projectRoot, 'dist', 'THIRD_PARTY_NOTICES.txt'),
                            template(dependencies) {
                                if (dependencies.length === 0) {
                                    return 'No third-party dependencies.';
                                }
                                return (
                                    'This file was auto-generated at build time.\n\n' +
                                    dependencies
                                        .map((dep) => {
                                            const lines = [
                                                `${dep.name}@${dep.version}`,
                                                `License: ${dep.license || 'UNKNOWN'}`,
                                            ];
                                            if (dep.author) {
                                                lines.push(`Author: ${typeof dep.author === 'string' ? dep.author : dep.author.text()}`);
                                            }
                                            if (dep.noticeText) {
                                                lines.push('', 'NOTICE:', dep.noticeText.trim());
                                            }
                                            if (dep.licenseText) {
                                                lines.push('', dep.licenseText.trim());
                                            }
                                            return lines.join('\n');
                                        })
                                        .join('\n\n' + '='.repeat(60) + '\n\n')
                                );
                            },
                        },
                    },
                }),
            ],
        },
    },
});
