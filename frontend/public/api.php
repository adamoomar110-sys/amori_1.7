<?php
/**
 * ============================================================
 * AMORI v1.7.1 — Cloud Web API (TTS MP3, Traducción & Resumen)
 * Startup Aura · Omar Horacio Adamo
 * ============================================================
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Range");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'status';

function readJsonBody() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function sendJson($data, $status = 200) {
    http_response_code($status);
    header("Content-Type: application/json; charset=UTF-8");
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function splitTextForTts($text, $maxLen = 180) {
    $text = preg_replace('/\s+/u', ' ', trim($text));
    if ($text === '') return [];

    // Separar por fin de oración primero
    $sentences = preg_split('/(?<=[.!?।;:\n])\s+/u', $text, -1, PREG_SPLIT_NO_EMPTY);
    $chunks = [];
    $current = '';

    foreach ($sentences as $sentence) {
        $sentence = trim($sentence);
        if ($sentence === '') continue;

        if (mb_strlen($sentence, 'UTF-8') > $maxLen) {
            if ($current !== '') {
                $chunks[] = $current;
                $current = '';
            }
            $words = preg_split('/\s+/u', $sentence, -1, PREG_SPLIT_NO_EMPTY);
            $sub = '';
            foreach ($words as $w) {
                if (mb_strlen($w, 'UTF-8') > $maxLen) {
                    if ($sub !== '') {
                        $chunks[] = $sub;
                        $sub = '';
                    }
                    $wLen = mb_strlen($w, 'UTF-8');
                    for ($offset = 0; $offset < $wLen; $offset += $maxLen) {
                        $chunks[] = mb_substr($w, $offset, $maxLen, 'UTF-8');
                    }
                } elseif ($sub === '') {
                    $sub = $w;
                } elseif (mb_strlen($sub . ' ' . $w, 'UTF-8') <= $maxLen) {
                    $sub .= ' ' . $w;
                } else {
                    $chunks[] = $sub;
                    $sub = $w;
                }
            }
            if ($sub !== '') $chunks[] = $sub;
        } elseif ($current === '') {
            $current = $sentence;
        } elseif (mb_strlen($current . ' ' . $sentence, 'UTF-8') <= $maxLen) {
            $current .= ' ' . $sentence;
        } else {
            $chunks[] = $current;
            $current = $sentence;
        }
    }
    if ($current !== '') {
        $chunks[] = $current;
    }

    return array_slice($chunks, 0, 45);
}

if ($action === 'status') {
    sendJson([
        'status' => 'ok',
        'app' => 'Amori v1.7.1',
        'author' => 'Aura · Omar Horacio Adamo'
    ]);
}

if ($action === 'translate') {
    $body = readJsonBody();
    $text = isset($body['text']) ? trim((string)$body['text']) : '';
    $target = isset($body['target']) ? preg_replace('/[^a-zA-Z\-]/', '', (string)$body['target']) : 'es';
    if ($target === '') $target = 'es';

    if ($text === '') {
        sendJson(['text' => '']);
    }

    // Dividir en bloques seguros de hasta 1800 caracteres
    $paragraphs = preg_split('/(\n+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE);
    $batches = [];
    $buf = '';
    foreach ($paragraphs as $part) {
        if (mb_strlen($buf . $part, 'UTF-8') > 1800 && $buf !== '') {
            $batches[] = $buf;
            $buf = $part;
        } else {
            $buf .= $part;
        }
    }
    if ($buf !== '') $batches[] = $buf;

    $translatedOut = '';
    foreach (array_slice($batches, 0, 8) as $batch) {
        $url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
            . rawurlencode($target) . '&dt=t&q=' . rawurlencode($batch);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]);
        $res = curl_exec($ch);
        curl_close($ch);

        $json = json_decode($res, true);
        if (is_array($json) && isset($json[0]) && is_array($json[0])) {
            foreach ($json[0] as $seg) {
                if (isset($seg[0])) {
                    $translatedOut .= $seg[0];
                }
            }
        } else {
            $translatedOut .= $batch;
        }
    }

    sendJson(['text' => $translatedOut]);
}

if ($action === 'tts') {
    $body = readJsonBody();
    $text = isset($body['text']) ? trim((string)$body['text']) : '';
    $voice = isset($body['voice']) ? (string)$body['voice'] : 'es-AR-TomasNeural';

    $langMap = [
        'es-AR' => 'es',
        'es-VE' => 'es',
        'pt-BR' => 'pt-BR',
        'en-US' => 'en',
        'it-IT' => 'it',
        'fr-FR' => 'fr',
        'de-DE' => 'de'
    ];
    $prefix = substr($voice, 0, 5);
    $tl = isset($langMap[$prefix]) ? $langMap[$prefix] : substr($voice, 0, 2);
    if ($tl === '') $tl = 'es';

    if ($text === '') {
        $text = (strpos($tl, 'es') === 0) ? 'Página sin texto.' : 'Page without text.';
    }

    $cacheDir = __DIR__ . '/tts_cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }

    // Limpieza ligera ocasional si hay muchos archivos antiguos
    $cacheKey = md5($tl . '|' . $text);
    $cacheFile = $cacheDir . '/' . $cacheKey . '.mp3';

    if (!file_exists($cacheFile) || filesize($cacheFile) < 256) {
        $chunks = splitTextForTts($text, 175);
        $mp3Data = '';

        // Descargar en lotes paralelos de 6 para máxima velocidad
        $batches = array_chunk($chunks, 6);
        foreach ($batches as $batch) {
            $mh = curl_multi_init();
            $handles = [];
            foreach ($batch as $idx => $chunk) {
                $url = 'https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl='
                    . rawurlencode($tl) . '&q=' . rawurlencode($chunk);
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_TIMEOUT => 12,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                ]);
                curl_multi_add_handle($mh, $ch);
                $handles[$idx] = $ch;
            }

            $running = null;
            do {
                curl_multi_exec($mh, $running);
                if ($running > 0) {
                    curl_multi_select($mh, 0.5);
                }
            } while ($running > 0);

            foreach ($handles as $ch) {
                $part = curl_multi_getcontent($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                if ($code === 200 && $part) {
                    $mp3Data .= $part;
                }
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }
            curl_multi_close($mh);
        }

        if ($mp3Data === '') {
            sendJson(['error' => 'No se pudo sintetizar el audio de esta página.'], 502);
        }

        @file_put_contents($cacheFile, $mp3Data);
    } else {
        $mp3Data = file_get_contents($cacheFile);
    }

    $size = strlen($mp3Data);
    header("Content-Type: audio/mpeg");
    header("Content-Length: " . $size);
    header("Accept-Ranges: bytes");
    header("Cache-Control: public, max-age=86400");
    echo $mp3Data;
    exit();
}

if ($action === 'summary') {
    $body = readJsonBody();
    $text = isset($body['text']) ? trim((string)$body['text']) : '';
    $title = isset($body['title']) ? trim((string)$body['title']) : 'Documento PDF';

    if (mb_strlen($text, 'UTF-8') < 40) {
        sendJson([
            'summary' => "📄 {$title}\n\nEste documento contiene muy poco texto extraíble o está compuesto principalmente por ilustraciones."
        ]);
    }

    // Resumen extractivo estructurado por densidad temática
    $clean = preg_replace('/\s+/u', ' ', $text);
    $sentences = preg_split('/(?<=[.!?])\s+/u', $clean, -1, PREG_SPLIT_NO_EMPTY);
    $validSentences = [];
    foreach ($sentences as $idx => $s) {
        $len = mb_strlen($s, 'UTF-8');
        if ($len >= 45 && $len <= 320) {
            $validSentences[] = ['idx' => $idx, 'text' => trim($s)];
        }
    }

    $stopwords = array_flip([
        'el','la','los','las','un','una','unos','unas','de','del','al','a','en','y','o','u','que','por','para','con','sin','sobre','entre','como','mas','más','pero','sus','su','se','es','son','fue','ser','esta','este','estos','estas','lo','le','les','no','si','sí','ya','muy','también','cuando','donde','todo','toda','todos','todas','hay','cada','the','and','for','that','with','this','from','are','was','were','have','has'
    ]);

    $freq = [];
    $wordsAll = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($clean, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY);
    foreach ($wordsAll as $w) {
        if (mb_strlen($w, 'UTF-8') > 3 && !isset($stopwords[$w])) {
            $freq[$w] = isset($freq[$w]) ? $freq[$w] + 1 : 1;
        }
    }
    arsort($freq);
    $topKeywords = array_slice(array_keys($freq), 0, 8);

    foreach ($validSentences as &$item) {
        $ws = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($item['text'], 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY);
        $score = 0;
        foreach ($ws as $w) {
            if (isset($freq[$w])) $score += min($freq[$w], 12);
        }
        $item['score'] = $score / max(count($ws), 6);
    }
    unset($item);

    usort($validSentences, function ($a, $b) {
        return $b['score'] <=> $a['score'];
    });

    $picked = array_slice($validSentences, 0, 6);
    usort($picked, function ($a, $b) {
        return $a['idx'] <=> $b['idx'];
    });

    $bullets = [];
    foreach ($picked as $p) {
        $bullets[] = "• " . $p['text'];
    }

    $kwLine = count($topKeywords) > 0 ? implode(', ', array_map('ucfirst', array_slice($topKeywords, 0, 6))) : 'Lectura general';
    $wordCount = count($wordsAll);

    $summaryOut = "📚 Resumen Ejecutivo — " . preg_replace('/\.pdf$/i', '', $title) . "\n\n"
        . "🔑 Conceptos Clave: " . $kwLine . "\n"
        . "📊 Extensión analizada: ~" . number_format($wordCount, 0, ',', '.') . " palabras\n\n"
        . "✨ Ideas Principales del Libro:\n"
        . implode("\n\n", $bullets) . "\n\n"
        . "— Generado por Amori IA · Startup Aura";

    sendJson(['summary' => $summaryOut]);
}

sendJson(['error' => 'Acción no reconocida'], 400);
