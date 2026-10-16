const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const server = http.createServer(app);

// Camuflagem de Origem (Origin Spoofing) para evitar bloqueios/desconexões na arena
const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, callback) => {
        info.req.headers['origin'] = 'https://agar.io';
        callback(true);
    }
});

let estadoEnxame = {
    modo: 'follow_mouse', // 'follow_mouse' | 'frenetic_feed'
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
    res.send("BoxBots Central Engine Online!");
});

app.post('/api/sync-arena', (req, res) => {
    if (req.body && req.body.gameWsUrl) {
        estadoEnxame.arenaUrl = req.body.gameWsUrl;
        enviarParaTodos({ type: "arena_auto_update", url: estadoEnxame.arenaUrl });
    }
    res.sendStatus(200);
});

wss.on('connection', (ws) => {
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
                enviarParaTodos({ type: 'swarm_status', state: estadoEnxame });
            }
            else if (msg.type === 'restart_all') {
                estadoEnxame.ativo = false;
                enviarParaTodos({ type: 'system_restart' });
                
                // Força o fecho de conexões ativas para reinício limpo
                setTimeout(() => {
                    wss.clients.forEach(client => client.close());
                }, 500);
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
