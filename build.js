import { build } from 'esbuild';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Centralized configuration for the build process.
 * Defines settings for package.json updates, timestamp generation, fxmanifest.lua, and esbuild.
 * @type {Object}
 */
const CONFIG = {
    /**
     * Configuration for package.json updates.
     */
    package: {
        /** Path to package.json file */
        filePath: 'package.json',
        /** Environment variable for version (e.g., 'TGT_RELEASE_VERSION') */
        versionKey: 'TGT_RELEASE_VERSION',
        /** Prefix to strip from version (e.g., 'v' from 'v1.0.0') */
        stripPrefix: 'v',
        /** JSON output formatting */
        indent: 2,
    },
    /**
     * Configuration for timestamp file generation.
     */
    timestamp: {
        /** Output file for timestamp */
        outputFile: '.yarn.installed',
        /** Format: 'iso' (ISO 8601), 'locale' (locale-based), or 'custom' (custom function) */
        format: 'iso',
        /** Locale settings for 'locale' format */
        localeSettings: {
            locale: 'en-US',
            options: { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' },
        },
        /** Custom timestamp formatting function */
        customFormat: (date) => date.toUTCString(),
    },
    /**
     * Configuration for fxmanifest.lua generation.
     */
    manifest: {
        /** Output file for fxmanifest.lua */
        outputFile: 'fxmanifest.lua',
        /** Sections to include in fxmanifest.lua, in order */
        sections: [
            {
                id: 'settings',
                type: 'key-value',
                enabled: true,
                data: [
                    { key: 'fx_version', value: 'cerulean' },
                    { key: 'game', value: 'common' },
                    { key: 'use_experimental_fxv2_oal', value: 'yes' },
                    { key: 'lua54', value: 'yes' },
                    { key: 'node_version', value: '22' },
                ],
            },
            {
                id: 'metadata',
                type: 'package-metadata',
                enabled: true,
                data: [
                    { manifestKey: 'name', pkgKey: 'name' },
                    { manifestKey: 'author', pkgKey: 'author' },
                    { manifestKey: 'version', pkgKey: 'version' },
                    { manifestKey: 'license', pkgKey: 'license' },
                    { manifestKey: 'repository', pkgKey: 'repository.url' },
                    { manifestKey: 'description', pkgKey: 'description' },
                ],
            },
            {
                id: 'client_scripts',
                type: 'list',
                enabled: true,
                singularKey: 'client_script',
                pluralKey: 'client_scripts',
                data: ['main.lua'],
            },
            {
                id: 'server_scripts',
                type: 'list',
                enabled: true,
                singularKey: 'server_script',
                pluralKey: 'server_scripts',
                data: ['build/index.js'],
            },
            {
                id: 'files',
                type: 'list',
                enabled: true,
                singularKey: 'file',
                pluralKey: 'files',
                data: ['web/build/index.html', 'web/build/**/*'],
            },
            {
                id: 'ui_page',
                type: 'key-value',
                enabled: true,
                data: [{ key: 'ui_page', value: 'web/build/index.html' }],
            },
            {
                id: 'provides',
                type: 'list',
                enabled: true,
                singularKey: 'provide',
                pluralKey: 'provide',
                data: ['mysql-async', 'ghmattimysql'],
            },
            {
                id: 'dependencies',
                type: 'list',
                enabled: true,
                singularKey: 'dependency',
                pluralKey: 'dependencies',
                data: ['/server:7290'],
            },
            {
                id: 'convar_category',
                type: 'convar',
                enabled: true,
                category: { name: 'QsMySQL', description: 'Configuration' },
                data: [
                    { description: 'Connection string', name: 'mysql_connection_string', type: 'CV_STRING', default: 'mysql://user:password@localhost/database' },
                    { description: 'Debug', name: 'mysql_debug', type: 'CV_BOOL', default: 'false' },
                ],
            },
        ],
    },
    /**
     * Configuration for esbuild.
     */
    esbuild: {
        /** Input files for esbuild */
        entryFiles: ['./src/index.js'],
        /** Output file for esbuild */
        outputFile: 'build/index.js',
        /** esbuild options */
        options: {
            bundle: true,
            platform: 'node',
            target: ['node16'],
            format: 'esm',
            logLevel: 'info',
            keepNames: true,
            dropLabels: ['DEV'],
            legalComments: 'inline',
        },
    },
};

/**
 * Validates the configuration to ensure all required fields are present and valid.
 * @throws {Error} If validation fails
 */
function validateConfig() {
    const errors = [];
    if (!CONFIG.package.filePath) errors.push('Missing package.json file path');
    if (!CONFIG.timestamp.outputFile) errors.push('Missing timestamp output file path');
    if (!CONFIG.manifest.outputFile) errors.push('Missing manifest output file path');
    if (!CONFIG.esbuild.entryFiles.length) errors.push('No esbuild entry files specified');

    for (const section of CONFIG.manifest.sections) {
        if (!section.id) errors.push(`Section ${section.id || 'unknown'} missing id`);
        if (!section.type) errors.push(`Section ${section.id} missing type`);
        if (section.enabled && !section.data?.length) {
            errors.push(`Section ${section.id} is enabled but has no data`);
        }
        if (section.type === 'list' && section.enabled) {
            if (!section.singularKey) errors.push(`Section ${section.id} missing singularKey`);
            if (!section.pluralKey) errors.push(`Section ${section.id} missing pluralKey`);
        }
        if (section.type === 'convar' && section.enabled) {
            if (!section.category?.name) errors.push(`Convar section ${section.id} missing category name`);
            if (!section.category?.description) errors.push(`Convar section ${section.id} missing category description`);
        }
    }

    if (errors.length) {
        throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
    }
}

/**
 * Updates package.json with a new version from the environment variable, if provided.
 * @returns {Promise<Object>} The parsed package.json object
 * @throws {Error} If reading, parsing, or writing package.json fails
 */
async function updatePackageJson() {
    const filePath = resolve(CONFIG.package.filePath);
    try {
        const data = await readFile(filePath, 'utf8');
        const pkg = JSON.parse(data);
        const newVersion = process.env[CONFIG.package.versionKey]?.replace(CONFIG.package.stripPrefix, '');
        if (newVersion) {
            pkg.version = newVersion;
            await writeFile(filePath, JSON.stringify(pkg, null, CONFIG.package.indent), 'utf8');
            console.log(`Updated ${CONFIG.package.filePath} to version ${newVersion}`);
        }
        return pkg;
    } catch (error) {
        throw new Error(`Failed to update ${CONFIG.package.filePath}: ${error.message}`);
    }
}

/**
 * Generates a timestamp file with the specified format.
 * @throws {Error} If timestamp generation or file writing fails
 */
async function generateTimestamp() {
    const filePath = resolve(CONFIG.timestamp.outputFile);
    try {
        const date = new Date();
        let output;
        switch (CONFIG.timestamp.format) {
            case 'iso':
                output = date.toISOString();
                break;
            case 'locale':
                output = date.toLocaleString(CONFIG.timestamp.localeSettings.locale, CONFIG.timestamp.localeSettings.options);
                break;
            case 'custom':
                output = CONFIG.timestamp.customFormat(date);
                break;
            default:
                throw new Error(`Invalid timestamp format: ${CONFIG.timestamp.format}`);
        }
        await writeFile(filePath, output, 'utf8');
        console.log(`Timestamp written to ${CONFIG.timestamp.outputFile}`);
    } catch (error) {
        throw new Error(`Failed to write timestamp to ${CONFIG.timestamp.outputFile}: ${error.message}`);
    }
}

/**
 * Renders a single section of fxmanifest.lua based on its type.
 * @param {Object} section - The section configuration
 * @param {Object} pkg - The parsed package.json object
 * @returns {string[]} Array of lines for the section
 */
function renderManifestSection(section, pkg) {
    if (!section.enabled || !section.data?.length) return [];

    const lines = [];
    switch (section.type) {
        case 'key-value':
            // Render key-value pairs (e.g., fx_version, ui_page)
            section.data.forEach(({ key, value }) => {
                lines.push(`${key} '${value}'`);
            });
            break;
        case 'package-metadata':
            // Render metadata from package.json (e.g., name, author)
            section.data.forEach(({ manifestKey, pkgKey }) => {
                const value = pkgKey.includes('.') ? pkgKey.split('.').reduce((obj, key) => obj?.[key], pkg) : pkg[pkgKey];
                if (value) {
                    lines.push(`${manifestKey} '${value}'`);
                }
            });
            break;
        case 'list':
            // Render lists with singular/plural keys based on item count
            const key = section.data.length === 1 ? section.singularKey : section.pluralKey;
            if (section.data.length > 1) {
                lines.push(`${key} {`);
                section.data.forEach(item => lines.push(`  '${item}',`));
                lines.push('}');
            } else {
                lines.push(`${key} '${section.data[0]}'`);
            }
            break;
        case 'convar':
            // Render convar_category with nested variables
            lines.push(`convar_category '${section.category.name}' {`);
            lines.push(`  '${section.category.description}',`);
            lines.push('  {');
            section.data.forEach(({ description, name, type, default: def }) => {
                lines.push(`    { '${description}', '${name}', '${type}', '${def}' },`);
            });
            lines.push('  }');
            lines.push('}');
            break;
        default:
            throw new Error(`Unsupported section type: ${section.type} in section ${section.id}`);
    }
    return lines.length ? lines.concat(['']) : [];
}

/**
 * Generates fxmanifest.lua based on the configuration.
 * @param {Object} pkg - The parsed package.json object
 * @throws {Error} If manifest generation or file writing fails
 */
async function generateManifest(pkg) {
    const filePath = resolve(CONFIG.manifest.outputFile);
    try {
        const lines = CONFIG.manifest.sections.reduce((acc, section) => {
            return acc.concat(renderManifestSection(section, pkg));
        }, []);
        await writeFile(filePath, lines.join('\n'), 'utf8');
        console.log(`Generated ${CONFIG.manifest.outputFile}`);
    } catch (error) {
        throw new Error(`Failed to generate ${CONFIG.manifest.outputFile}: ${error.message}`);
    }
}

/**
 * Runs esbuild to compile the source code.
 * @throws {Error} If esbuild compilation fails
 */
async function runEsbuild() {
    try {
        await build({
            entryPoints: CONFIG.esbuild.entryFiles,
            outfile: CONFIG.esbuild.outputFile,
            ...CONFIG.esbuild.options,
        });
        console.log(`Built ${CONFIG.esbuild.outputFile}`);
    } catch (error) {
        throw new Error(`esbuild failed: ${error.message}`);
    }
}

/**
 * Orchestrates the entire build process.
 * @throws {Error} If any build step fails
 */
async function executeBuild() {
    try {
        // Validate configuration before starting
        validateConfig();

        // Update package.json with new version
        const pkg = await updatePackageJson();

        // Generate timestamp file
        await generateTimestamp();

        // Generate fxmanifest.lua
        await generateManifest(pkg);

        // Run esbuild compilation
        await runEsbuild();

        console.log('Build process completed successfully');
    } catch (error) {
        console.error('Build process failed:', error.message);
        process.exit(1);
    }
}

// Start the build process
executeBuild();