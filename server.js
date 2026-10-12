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
const wss = new WebSocket.Server({ server });

let painelConexao = null;
let registradorTampermonkey = null;

// --- BANCO DE DADOS DA IA EVOLUTIVA DO JOGADOR ---
let geracaoPlayerIA = 1;
let melhorScorePlayer = 0;
let scorePartidaAtual = 0;

// DNA Inicial do Jogador Principal (Pesos de Tomada de Decisão Neural)
let dnaPlayer = {
    ganhoComida: 1.5,      // Força de atração por pellets
    pesoFuga: -2.8,        // Força de repulsão de inimigos maiores e vírus
    pesoAtaque: 2.2,       // Força de perseguição a alvos menores
    limiteMassaSplit: 1.1  // Margem de segurança matemática para o bote
};

app.post('/api/sync-arena', (req, res) => {
    if (req.body && req.body.gameWsUrl) {
        if (painelConexao && painelConexao.readyState === WebSocket.OPEN) {
            painelConexao.send(JSON.stringify({ type: "arena_auto_update", url: req.body.gameWsUrl }));
        }
    }
    res.sendStatus(200);
});

wss.on('connection', (ws) => {
    // Identifica se quem conectou foi o Painel Python ou o Tampermonkey do jogo
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            
            // Sincroniza comandos vindos da Interface Python
            if (msg.type === "set_hotkey") {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            }
            
            // Monitoramento e Telemetria em Tempo Real vinda do Jogo (Tampermonkey)
            else if (msg.type === "ia_status") {
                if (painelConexao && painelConexao.readyState === WebSocket.OPEN) {
                    painelConexao.send(JSON.stringify(msg)); // Repassa o status de LIGADO/DESLIGADO pro painel
                }
                
                // Algoritmo Evolutivo aciona quando a IA é desligada ou reseta
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
                // Guarda a referência do painel Python para logs
                painelConexao = ws;
            }
        } catch (e) {}
    });
});

// Processamento Matemático do Algoritmo Genético (Bypass de Lerdeza)
function processarEvolucaoIA() {
    geracaoPlayerIA++;
    
    // Se a rodada foi boa, estabiliza os genes. Se foi ruim, aplica mutação adaptativa
    if (scorePartidaAtual >= melhorScorePlayer * 0.8) {
        enviarLogGlobal(`👍 [GENES] Geração ${geracaoPlayerIA}: Mantendo base sólida. Refinando precisão.`);
        dnaPlayer.pesoAtaque += (Math.random() - 0.3) * 0.1;
        dnaPlayer.pesoFuga -= (Math.random() - 0.2) * 0.1;
    } else {
        // Mutação de sobrevivência: aumenta o medo e a velocidade de desvio contra perigos
        enviarLogGlobal(`🧬 [MUTACAO] Geração ${geracaoPlayerIA}: Mutando pesos adaptativos para corrigir falhas.`);
        dnaPlayer.pesoFuga -= Math.random() * 0.3; // Fica mais cauteloso
        dnaPlayer.ganhoComida += (Math.random() - 0.5) * 0.2;
    }

    // Despacha o novo DNA mutado direto para o Tampermonkey na arena viva
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

const PORT = process.env.PORT || 4848;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=== INSTÂNCIA CENTRAL MESTRE DE IA ONLINE NA PORTA ${PORT} ===`);
});
