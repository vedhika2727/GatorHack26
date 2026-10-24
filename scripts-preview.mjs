// Turns the single-file build (dist-preview/index.html) into a hosted-preview page body.
import fs from 'fs';
const html = fs.readFileSync('dist-preview/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const keepHead = head.replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
const out = '<meta name="claude:viewport-fit-sides" content="cover">\n' + keepHead + '\n' + body;
fs.writeFileSync('dist-preview/preview.html', out);
console.log('dist-preview/preview.html', Math.round(out.length / 1024) + ' KB', out.slice(0, 80).replace(/\n/g, ' '));
