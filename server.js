const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Permitir requisições Cross-Origin (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let painelConexao = null;

// BANCO DE DADOS DA IA EVOLUTIVA
let geracaoPlayerIA = 1;
let melhorScorePlayer = 0;
let scorePartidaAtual = 0;

let dnaPlayer = {
    ganhoComida: 1.5,
    pesoFuga: -2.8,
    pesoAtaque: 2.2,
    limiteMassaSplit: 1.1
};

app.get('/', (req, res) => {
    res.send("BoxBots Swarm Engine - Online no Render!");
});

app.post('/api/sync-arena', (req, res) => {
    if (req.body && req.body.gameWsUrl) {
        if (painelConexao && painelConexao.readyState === WebSocket.OPEN) {
            painelConexao.send(JSON.stringify({ type: "arena_auto_update", url: req.body.gameWsUrl }));
        }
    }
    res.sendStatus(200);
});

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            
            if (msg.type === "set_hotkey") {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            }
            else if (msg.type === "ia_status") {
                if (painelConexao && painelConexao.readyState === WebSocket.OPEN) {
                    painelConexao.send(JSON.stringify(msg));
                }
                
                if (msg.ativo === false) {
                    processarEvolucaoIA();
                }
            }
            else if (msg.type === "telemetria_score") {
                scorePartidaAtual = msg.score;
                if (scorePartidaAtual > melhorScorePlayer) {
                    melhorScorePlayer = scorePartidaAtual;
                    enviarLogGlobal(`✨ [IA EVOLUTIVA] Novo Recorde da Célula! Score: ${melhorScorePlayer} na Geração ${geracaoPlayerIA}`);
                }
            }
            else {
                painelConexao = ws;
            }
        } catch (e) {}
    });
});

function processarEvolucaoIA() {
    geracaoPlayerIA++;
    
    if (scorePartidaAtual >= melhorScorePlayer * 0.8) {
        enviarLogGlobal(`👍 [GENES] Geração ${geracaoPlayerIA}: Mantendo base sólida. Refinando precisão.`);
        dnaPlayer.pesoAtaque += (Math.random() - 0.3) * 0.1;
        dnaPlayer.pesoFuga -= (Math.random() - 0.2) * 0.1;
    } else {
        enviarLogGlobal(`🧬 [MUTACAO] Geração ${geracaoPlayerIA}: Mutando pesos adaptativos para corrigir falhas.`);
        dnaPlayer.pesoFuga -= Math.random() * 0.3;
        dnaPlayer.ganhoComida += (Math.random() - 0.5) * 0.2;
    }

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "update_dna", dna: dnaPlayer, gen: geracaoPlayerIA }));
        }
    });
}

function enviarLogGlobal(texto) {
    console.log(texto);
    if (painelConexao && painelConexao.readyState === WebSocket.OPEN) {
        painelConexao.send(JSON.stringify({ type: "ia_log", msg: texto }));
    }
}

// O Render injeta a porta dinamicamente na variável process.env.PORT
const PORT = process.env.PORT || 4848;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=== INSTÂNCIA CENTRAL MESTRE DE IA ONLINE NA PORTA ${PORT} ===`);
});
