const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<head>', '<head>\n  <base href="../">\n  <meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; connect-src \'self\'; font-src \'self\' data:; frame-src \'self\' blob:">\n  <script src="mockup-fiel/guard.js"></script>');
// Mantém o shell e os renderizadores. Só remove conexões e inicialização PWA.
html = html.replace(/<script[^>]+src="(?:https:[^"]+|supabase-config\.js[^"]*|src\/core\/pwa\.js[^"]*)"[^>]*><\/script>/g, '');
html = html.replace(/<link[^>]+(?:https:[^"]*|rel="manifest")[^>]*>/g, '');
html = html.replace(/(<script src="app\.js[^>]+><\/script>)/, '<script src="mockup-fiel/vendor/lucide.min.js"></script>\n<script src="mockup-fiel/fixtures.js"></script>\n<script src="mockup-fiel/bridge.js"></script>\n$1\n<script src="mockup-fiel/preview.js"></script>');
html = html.replace('</head>', '<link rel="stylesheet" href="mockup-fiel/clear.css"><link rel="stylesheet" href="mockup-fiel/profile-appearance.css">\n</head>');
html = html.replace('</body>', '<script src="mockup-fiel/profile-appearance.js"></script></body>');
fs.writeFileSync(path.join(__dirname, 'app.html'), html);
const fc = require('../tests/fixtures/fcDashboardSource').matrix().map(row=>row.map(v=>v instanceof Date?`${v.getMonth()+1}/${v.getFullYear()}`:v));
fs.writeFileSync(path.join(__dirname, 'fc-fixture.json'), JSON.stringify(fc));
console.log('Shell original reproduzido; scripts de apresentação preservados.');
