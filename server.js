const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let bots =;
let liderCoordenadas = { x: 0, y: 0 };

let configuracaoSwarm = {
    gameWsUrl: "wss://chat.delt.io/delta7?protocol=v1",
    quantidade: 20,
    nome: "BoxBot",
    comportamento: "feedMe"
};

class BotInstancia {
    constructor(id, targetUrl, name) {
        this.id = id;
        this.targetUrl = targetUrl;
        this.name = `${name}-${id}`;
        this.ws = null;
        this.intervaloMovimento = null;
        this.conectado = false;
    }

    conectar() {
        try {
            this.ws = new WebSocket(this.targetUrl, {
                perMessageDeflate: false,
                headers: {
                    'Origin': 'https://pages.dev',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            this.ws.binaryType = 'arraybuffer';

            this.ws.on('open', () => {
                this.conectado = true;
                this.spawnar();
                this.iniciarLoopMecanico();
            });

            this.ws.on('close', () => {
                this.conectado = false;
                this.parar();
            });

            this.ws.on('error', () => {});
        } catch (e) {}
    }

    spawnar() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const buffer = Buffer.alloc(1 + 2 * this.name.length);
        buffer.writeUInt8(0, 0);
        for (let i = 0; i < this.name.length; i++) {
            buffer.writeUInt16LE(this.name.charCodeAt(i), 1 + 2 * i);
        }
        this.ws.send(buffer);
    }

    iniciarLoopMecanico() {
        this.intervaloMovimento = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            const buffer = Buffer.alloc(21);
            buffer.writeUInt8(16, 0); 
            buffer.writeDoubleLE(liderCoordenadas.x, 1);
            buffer.writeDoubleLE(liderCoordenadas.y, 9);
            buffer.writeUInt32LE(0, 17);
            this.ws.send(buffer);

            if (configuracaoSwarm.comportamento === 'feedMe') {
                this.executarAcao(21);
            }
        }, 65);
    }

    executarAcao(opcode) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const buffer = Buffer.alloc(1);
        buffer.writeUInt8(opcode, 0);
        this.ws.send(buffer);
    }

    parar() {
        if (this.intervaloMovimento) clearInterval(this.intervaloMovimento);
        if (this.ws) this.ws.close();
    }
}

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'update_coords' || msg.type === 'player_position') {
                liderCoordenadas = msg.data;
            } else if (msg.type === 'action_trigger') {
                const opcode = msg.data.action === 'split' ? 17 : 21;
                bots.forEach(bot => { if (bot.conectado) bot.executarAcao(opcode); });
            } else if (msg.type === 'update_settings') {
                configuracaoSwarm = { ...configuracaoSwarm, ...msg.data };
            } else if (msg.type === 'start_swarm') {
                bots.forEach(b => b.parar());
                bots =;
                configuracaoSwarm = { ...configuracaoSwarm, ...msg.data };
                for (let i = 1; i <= configuracaoSwarm.quantidade; i++) {
                    setTimeout(() => {
                        const bot = new BotInstancia(i, configuracaoSwarm.gameWsUrl, configuracaoSwarm.nome);
                        bot.conectar();
                        bots.push(bot);
                    }, i * 60);
                }
            } else if (msg.type === 'stop_swarm') {
                bots.forEach(b => b.parar());
                bots =;
            }
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 4848;
server.listen(PORT, () => console.log(`=== MOTOR CLOUD ATIVO NA PORTA ${PORT} ===`));
