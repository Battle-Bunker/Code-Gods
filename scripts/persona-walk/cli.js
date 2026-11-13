// node cli.js PORT command [args]   (see README.txt)
const http = require('http'), fs = require('fs');
const [port, cmd, ...rest] = process.argv.slice(2);
if (!port || !cmd) { console.error('usage: node cli.js PORT command [args]'); process.exit(2); }
let args = rest, text = '';
if (cmd === 'type' || cmd === 'fill') {
  args = rest.slice(0, 1);
  text = rest[1] === '--file' ? fs.readFileSync(rest[2], 'utf8').replace(/\n$/, '') : rest.slice(1).join(' ');
}
const req = http.request({ host: '127.0.0.1', port: +port, method: 'POST', path: '/', timeout: 180000 }, res => { res.pipe(process.stdout); });
req.on('error', e => { console.error(`cannot reach the server on port ${port}: ${e.message} (not started yet, still signing in, or it has exited)`); process.exit(1); });
req.end(JSON.stringify({ cmd, args, text }));
