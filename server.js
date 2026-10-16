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

// Camuflagem de Cabeçalhos/Origem para evitar desconexões da arena do jogo
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, callback) => {
        info.req.headers['origin'] = 'https://agar.io';
        callback(true);
    }
});

let estadoEnxame = {
    modo: 'follow_mouse', // 'follow_mouse' | 'feed_center'
    ativo: false,
    quantidade: 50,
    tag: 'BoxBot',
    arenaUrl: '',
    targetX: 0,
    targetY: 0
};

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
    res.send("BoxBots Central Command Engine - Online no Render!");
});

app.post('/api/sync-arena', (req, res) => {
    if (req.body && req.body.gameWsUrl) {
        estadoEnxame.arenaUrl = req.body.gameWsUrl;
        enviarParaTodos({ type: "arena_auto_update", url: estadoEnxame.arenaUrl });
    }
    res.sendStatus(200);
});

wss.on('connection', (ws) => {
    // Sincroniza estado inicial assim que conecta
    ws.send(JSON.stringify({ type: 'sync_state', state: estadoEnxame, dna: dnaPlayer, gen: geracaoPlayerIA }));

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            
            if (msg.type === 'start_swarm') {
                estadoEnxame.ativo = true;
                estadoEnxame.quantidade = msg.amount || estadoEnxame.quantidade;
                estadoEnxame.tag = msg.tag || estadoEnxame.tag;
                enviarParaTodos({ type: 'swarm_status', state: estadoEnxame });
            }
            else if (msg.type === 'stop_swarm' || (msg.type === 'ia_status' && msg.ativo === false)) {
                estadoEnxame.ativo = false;
                processarEvolucaoIA();
                enviarParaTodos({ type: 'swarm_status', state: estadoEnxame });
            }
            else if (msg.type === 'set_mode') {
                estadoEnxame.modo = msg.modo;
                enviarParaTodos({ type: 'update_mode', modo: estadoEnxame.modo });
            } 
            else if (msg.type === 'update_pos') {
                estadoEnxame.targetX = msg.x;
                estadoEnxame.targetY = msg.y;
                enviarParaTodos({ type: 'target_coords', x: msg.x, y: msg.y });
            }
            else if (msg.type === 'telemetria_score') {
                scorePartidaAtual = msg.score;
                if (scorePartidaAtual > melhorScorePlayer) {
                    melhorScorePlayer = scorePartidaAtual;
                }
            }
        } catch (e) {}
    });
});

function processarEvolucaoIA() {
    geracaoPlayerIA++;
    if (scorePartidaAtual >= melhorScorePlayer * 0.8) {
        dnaPlayer.pesoAtaque += (Math.random() - 0.3) * 0.1;
        dnaPlayer.pesoFuga -= (Math.random() - 0.2) * 0.1;
    } else {
        dnaPlayer.pesoFuga -= Math.random() * 0.3;
        dnaPlayer.ganhoComida += (Math.random() - 0.5) * 0.2;
    }

    enviarParaTodos({ type: "update_dna", dna: dnaPlayer, gen: geracaoPlayerIA });
}

function enviarParaTodos(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 4848;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=== CENTRAL BOXBOTS ONLINE NA PORTA ${PORT} ===`);
});
