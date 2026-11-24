#!/usr/bin/env node

//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------


// Composes the Fabric portal embed URL from .env.local (or .env.fabric*) and
// launches `playwright-cli -s=fabric open --persistent` with the LNA-disable
// Chromium flags. See .github/skills/playwright-cli/references/fabric-embed.md
// for the full background.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(file) {
    return Object.fromEntries(
        readFileSync(file, 'utf8')
            .split('\n')
            .filter((l) => l && !l.startsWith('#') && l.includes('='))
            .map((l) => {
                const i = l.indexOf('=');
                return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
            }),
    );
}

// Load .env.local first (developer overrides), then layer .env.fabric (written
// by `npx rayfin up`) to fill in anything missing.
const cwd = process.cwd();
const candidates = ['.env.local', '.env.fabric'].map((f) => resolve(cwd, f));
const found = candidates.filter((f) => existsSync(f));
if (found.length === 0) {
    console.error('Missing .env.local and .env.fabric — run `npx rayfin up` first.');
    process.exit(1);
}

const env = found.reduce((acc, file) => ({ ...parseEnvFile(file), ...acc }), {});

const portal = (env.VITE_FABRIC_PORTAL_URL || '').replace(/\/$/, '');
const ws = env.VITE_FABRIC_WORKSPACE_ID;
const item = env.VITE_FABRIC_ITEM_ID;
const dev = process.env.DEV_URL || 'http://localhost:5173';

if (!portal || !ws || !item) {
    console.error(
        'Need VITE_FABRIC_PORTAL_URL, VITE_FABRIC_WORKSPACE_ID, VITE_FABRIC_ITEM_ID in .env.local or .env.fabric.',
    );
    process.exit(1);
}

const url = `${portal}/groups/${ws}/appbackends/${item}?experience=power-bi&devUri=${encodeURIComponent(dev)}`;

console.log(`Opening Fabric portal embed → ${url}`);
console.log('First run: sign in to Microsoft when prompted; cookies persist for the next run.');

// shell:true is required on Windows so Node can resolve the playwright-cli .cmd shim
// through cmd.exe's PATHEXT lookup.  However cmd.exe treats & as a command separator,
// so any URL arg that contains & (e.g. ?experience=power-bi&devUri=…) must be wrapped
// in double-quotes to be passed as a single token.  Both cmd.exe and sh honour this.
const quoteForShell = (arg) => `"${arg}"`;
const args = ['-s=fabric', 'open', '--persistent', '--config=.playwright-config.json', quoteForShell(url)];
const child = spawn('playwright-cli', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
