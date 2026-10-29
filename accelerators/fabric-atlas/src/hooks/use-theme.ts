//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useEffect, useState } from "react";

const THEME_KEY = "atlas.theme.v2";

export function useAppTheme() {
    const [isDark, setIsDark] = useState(() => {
        try {
            return localStorage.getItem(THEME_KEY) === "dark";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        document.documentElement.classList.toggle("dark", isDark);
        document.documentElement.style.colorScheme = isDark ? "dark" : "light";
        try {
            localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
        } catch {
            // The selected theme still applies when storage is unavailable.
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark((prev: boolean) => !prev);

    return { isDark, toggleTheme };
}
