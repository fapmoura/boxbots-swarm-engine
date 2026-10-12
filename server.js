const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let bots = [];
let liderCoordenadas = { x: 0, y: 0 };
let liderMassa = 10; // Rastreia o tamanho do jogador principal para cálculos de IA

let configuracaoSwarm = {
    gameWsUrl: "wss://chat.delt.io/delta7?protocol=v1",
    quantidade: 20,
    nome: "BoxBot",
    comportamento: "feedMe"
};

class BotIntancia {
    constructor(id, targetUrl, name) {
        this.id = id;
        this.targetUrl = targetUrl;
        this.name = `${name}-${id}`;
        this.ws = null;
        this.intervaloMovimento = null;
        this.conectado = false;
        
        // Memória e Física de IA do Bot
        this.massaAtual = 10; 
        this.anguloOrbita = (Math.PI * 2 / configuracaoSwarm.quantidade) * id;
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
                this.iniciarCerebroIA();
            });

            this.ws.on('close', () => { this.conectado = false; this.parar(); });
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

    iniciarCerebroIA() {
        this.intervaloMovimento = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            let alvoX = liderCoordenadas.x;
            let alvoY = liderCoordenadas.y;

            // --- MOTOR DE COMPORTAMENTOS INTELIGENTES (Calibragem Avançada) ---
            
            if (configuracaoSwarm.comportamento === 'orbit') {
                // Órbita geométrica circular perfeita ao redor do centro do líder
                this.anguloOrbita += 0.04; // Velocidade de rotação da órbita
                const raioOrbita = 220 + (this.id * 5); // Distância segura para coletar pellets ao redor
                alvoX += Math.cos(this.anguloOrbita) * raioOrbita;
                alvoY += Math.sin(this.anguloOrbita) * raioOrbita;
            } 
            else if (configuracaoSwarm.comportamento === 'scatter') {
                // Dispersão tática de emergência
                alvoX += (Math.random() - 0.5) * 800;
                alvoY += (Math.random() - 0.5) * 800;
            }
            else if (configuracaoSwarm.comportamento === 'freeze') {
                return; // Trava o bot estático na posição atual
            }

            // Envio do Pacote Binário de Movimento (Opcode 16) apontando pro centro exato do alvo
            const bufferMovimento = Buffer.alloc(21);
            bufferMovimento.writeUInt8(16, 0); 
            bufferMovimento.writeDoubleLE(alvoX, 1);
            bufferMovimento.writeDoubleLE(alvoY, 9);
            bufferMovimento.writeUInt32LE(0, 17);
            this.ws.send(bufferMovimento);

            // --- SISTEMA DE TOMADA DE DECISÃO DE MASSA AUTOMÁTICA ---
            if (configuracaoSwarm.comportamento === 'feedMe') {
                // REGRA 1: Se o bot crescer mais que o líder, executa Auto-Split (Opcode 17) em direção ao centro do jogador
                if (this.massaAtual > liderMassa * 1.2) {
                    this.executarAcao(17); 
                } 
                // REGRA 2: Se ainda estiver maior ou em rota de aproximação, ejeta massa continuamente (Opcode 21)
                else {
                    this.executarAcao(21);
                }
            }
        }, 65); // Clock ultra veloz de 65ms importado da engenharia de ponta do AposBot
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
            
            // Atualiza dados de telemetria do líder vindos do painel Python
            if (msg.type === 'update_coords' || msg.type === 'player_position') {
                liderCoordenadas = msg.data;
                if (msg.massa) liderMassa = msg.massa; // Sincroniza tamanho real da sua célula
            } 
            // Disparos manuais por Hotkeys
            else if (msg.type === 'action_trigger') {
                const opcode = msg.data.action === 'split' ? 17 : 21;
                bots.forEach(bot => { if (bot.conectado) bot.executarAcao(opcode); });
            } 
            else if (msg.type === 'update_settings') {
                configuracaoSwarm = { ...configuracaoSwarm, ...msg.data };
            } 
            else if (msg.type === 'start_swarm') {
                bots.forEach(b => b.parar());
                bots = [];
                configuracaoSwarm = { ...configuracaoSwarm, ...msg.data };
                for (let i = 1; i <= configuracaoSwarm.quantidade; i++) {
                    setTimeout(() => {
                        const bot = new BotIntancia(i, configuracaoSwarm.gameWsUrl, configuracaoSwarm.nome);
                        bot.conectar();
                        bots.push(bot);
                    }, i * 60);
                }
            } 
            else if (msg.type === 'stop_swarm') {
                bots.forEach(b => b.parar());
                bots = [];
            }
        } catch (e) {}
    });
});

// Força o Render a mapear a porta estável do contêiner
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=== MOTOR CLOUD INTELIGENTE ATIVO NA PORTA ${PORT} ===`);
});
