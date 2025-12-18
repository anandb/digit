const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '../dist/digit/browser');
const indexPath = path.join(distPath, 'index.html');
const outputHtmlPath = path.join(distPath, 'single-index.html');

if (!fs.existsSync(indexPath)) {
    console.error(`Error: ${indexPath} not found. Run 'ng build' first.`);
    process.exit(1);
}

let htmlContent = fs.readFileSync(indexPath, 'utf8');

// Inline CSS
// Matches <link rel="stylesheet" href="styles-XXXX.css" media="print" onload="...">
// We need to be careful with the regex to capture the href.
// Angular 19 might use slightly different attributes, but typically it's rel="stylesheet" and href.
// The list output showed `styles-5INURTSO.css`.

const linkRegex = /<link[^>]+href="([^"]+\.css)"[^>]*>/g;
htmlContent = htmlContent.replace(linkRegex, (match, href) => {
    const cssPath = path.join(distPath, href);
    if (fs.existsSync(cssPath)) {
        console.log(`Inlining CSS: ${href}`);
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        return `<style>${cssContent}</style>`;
    } else {
        console.warn(`Warning: CSS file ${cssPath} not found.`);
        return match;
    }
});

// Inline JS
// Matches <script src="main-XXXX.js" type="module"></script>
const scriptRegex = /<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g;
htmlContent = htmlContent.replace(scriptRegex, (match, src) => {
    const jsPath = path.join(distPath, src);
    if (fs.existsSync(jsPath)) {
        console.log(`Inlining JS: ${src}`);
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        // If it's a module, we should keep type="module" but inline the content.
        // However, for a single file, we might want to just use <script type="module">...</script>
        return `<script type="module">${jsContent}</script>`;
    } else {
        console.warn(`Warning: JS file ${jsPath} not found.`);
        return match;
    }
});

fs.writeFileSync(outputHtmlPath, htmlContent);
console.log(`Success! Single HTML file generated at: ${outputHtmlPath}`);
