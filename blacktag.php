<?php
/**
 * BLACK TAG
 * Machine triage for the four people restoring a hospital.
 * Drop-in page. Assets live in assets/blacktag/, decision ledger in var/.
 */
declare(strict_types=1);

require __DIR__ . '/assets/blacktag/scenario.php';

$LEDGER = __DIR__ . '/var/ledger.json';

/* ------------------------------------------------------------------ *
 * Decision ledger.
 * A black tag is a decision not to restore something. The point of the
 * tool is that it is signed, timestamped and tamper-evident, so that the
 * person who made it at 04:12 is not carrying it alone six months later.
 * Hash chain: sha256(previous_hash + canonical entry).
 * ------------------------------------------------------------------ */
function ledger_read(string $path): array {
    if (!is_file($path)) return [];
    $raw = json_decode((string)file_get_contents($path), true);
    return is_array($raw) ? $raw : [];
}

function ledger_append(string $path, array $entry): array {
    @mkdir(dirname($path), 0775, true);
    $fh = fopen($path, 'c+');
    if (!$fh) throw new RuntimeException('ledger unavailable');
    flock($fh, LOCK_EX);
    $raw   = stream_get_contents($fh);
    $chain = json_decode($raw ?: '[]', true);
    if (!is_array($chain)) $chain = [];

    $prev = $chain ? $chain[count($chain) - 1]['hash'] : str_repeat('0', 64);
    $entry['seq']  = count($chain) + 1;
    $entry['prev'] = $prev;
    $entry['at']   = gmdate('c');
    $entry['hash'] = hash('sha256', $prev . json_encode($entry, JSON_UNESCAPED_SLASHES));
    $chain[] = $entry;

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($chain, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $entry;
}

function ledger_verify(array $chain): bool {
    $prev = str_repeat('0', 64);
    foreach ($chain as $e) {
        $h = $e['hash'] ?? '';
        $c = $e; unset($c['hash']);
        if (($e['prev'] ?? '') !== $prev) return false;
        if (hash('sha256', $prev . json_encode($c, JSON_UNESCAPED_SLASHES)) !== $h) return false;
        $prev = $h;
    }
    return true;
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */
if (isset($_GET['api'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $ids = array_column($SERVICES, 'id');

    try {
        switch ($_GET['api']) {
            case 'sign':
                $in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
                $svc = (string)($in['service'] ?? '');
                if (!in_array($svc, $ids, true)) throw new InvalidArgumentException('unknown service');
                $row = $SERVICES[array_search($svc, $ids, true)];
                echo json_encode(['ok' => true, 'entry' => ledger_append($LEDGER, [
                    'decision'  => 'BLACK',
                    'service'   => $svc,
                    'name'      => html_entity_decode((string)$row['name'], ENT_QUOTES, 'UTF-8'),
                    'systems'   => (int)$row['systems'],
                    'incident'  => 'CCG-2026-0919',
                    'signed'    => 'P. — IT manager',
                    'counter'   => 'Dr. Mercier — Chief Medical Officer',
                    'basis'     => (string)($in['basis'] ?? 'no acute clinical dependency within the restore horizon'),
                    'clock'     => (string)($in['clock'] ?? ''),
                ])]);
                return;

            case 'ledger':
                $chain = ledger_read($LEDGER);
                echo json_encode(['ok' => true, 'chain' => $chain, 'intact' => ledger_verify($chain)]);
                return;

            case 'reset':
                @unlink($LEDGER);
                echo json_encode(['ok' => true]);
                return;
        }
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'no such endpoint']);
    } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    }
    return;
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
$total = array_sum(array_column($SERVICES, 'systems'));
$boot  = json_encode([
    'services'  => $SERVICES,
    'events'    => $EVENTS,
    'capacity'  => CAPACITY,
    'total'     => $total,
    'horizon'   => round($total / CAPACITY, 1),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$asset = 'assets/blacktag/';
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BLACK TAG — CyberCity General Hospital</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23171310'/%3E%3Crect x='3' y='3' width='10' height='10' fill='%23b79554'/%3E%3C/svg%3E">
<link rel="stylesheet" href="<?= $asset ?>blacktag.css">
</head>
<body class="bt">

<canvas id="ward" aria-hidden="true"></canvas>
<div id="wardfail" class="wardfail" hidden></div>
<div class="vignette" aria-hidden="true"></div>

<div class="shell" data-stage="brief">

  <!-- ─── status bar ─────────────────────────────────────────────── -->
  <header class="bar">
    <div class="mark">
      <span class="mark-t">BLACK<i>TAG</i></span>
      <span class="mark-s">CyberCity General · incident CCG-2026-0919</span>
    </div>

    <nav class="rail" id="rail">
      <button class="rail-i" data-go="brief"><b>01</b> The night</button>
      <button class="rail-i" data-go="impact"><b>02</b> Impact</button>
      <button class="rail-i" data-go="triage"><b>03</b> Triage</button>
      <button class="rail-i" data-go="restore"><b>04</b> Restore</button>
      <button class="rail-i" data-go="reckoning"><b>05</b> Reckoning</button>
    </nav>

    <div class="clock">
      <div class="clk" id="clk">02:14</div>
      <div class="clk-s" id="clkday">Saturday · minute zero</div>
    </div>
  </header>

  <!-- ─── stage 01 · brief ───────────────────────────────────────── -->
  <section class="stage st-brief" data-for="brief">
    <div class="brief-l">
      <p class="over">Saturday, 02:14</p>
      <h1>The push came through<br>Group Policy.</h1>
      <p class="lede">Which means it came from inside. Two domain controllers first, then the file
      servers, then everything that trusted them. By the time the on-call phone rang, eleven minutes
      of it had already happened.</p>
      <p class="lede">The account it rode in on belonged to an imaging maintenance contractor and had
      no second factor. It had been in the estate for nine days. 340 GB left the building before a
      single file was encrypted.</p>
      <p class="sig">Four people work in this department.</p>
    </div>

    <div class="brief-r">
      <div class="crew">
        <?php foreach ($DEFENDERS as $d): ?>
        <div class="crew-i">
          <div class="crew-n"><?= $d['n'] ?></div>
          <div class="crew-r"><?= $d['r'] ?></div>
          <div class="crew-d"><?= $d['d'] ?></div>
        </div>
        <?php endforeach; ?>
      </div>

      <div class="maths">
        <p>Restoring a server is not copying a file. It is rebuild, re-trust, and then somebody who
        knows what the system looks like when it is working has to sit down and confirm that it is.
        In this hospital that person is Lou, and there is one of her.</p>
        <div class="maths-row">
          <div><b><?= $total ?></b><span>systems encrypted</span></div>
          <div class="op">÷</div>
          <div><b><?= (int)CAPACITY ?></b><span>validated per day</span></div>
          <div class="op">=</div>
          <div class="hot"><b><?= round($total / CAPACITY) ?></b><span>days</span></div>
        </div>
        <p class="thin">The 2019 disaster recovery plan ranks all <?= $total ?> of them. It does not
        say which ones to skip.</p>
      </div>

      <button class="act" id="begin">Begin the incident</button>
    </div>
  </section>

  <!-- ─── stage 02 · impact ──────────────────────────────────────── -->
  <section class="stage st-impact" data-for="impact">
    <div class="imp-head">
      <p class="over">Encryption in progress</p>
      <h2 id="impNow">—</h2>
    </div>
    <ul class="falling" id="falling"></ul>
    <div class="imp-foot" id="impFoot" hidden>
      <p>Everything the hospital does electronically is now unavailable. Nothing has been decided yet.</p>
      <button class="act" id="toTriage">Open the board</button>
    </div>
  </section>

  <!-- ─── stage 03/04 · board ────────────────────────────────────── -->
  <section class="stage st-board" data-for="triage restore">
    <div class="board-head">
      <div>
        <p class="over" id="boardOver">Triage</p>
        <h2 id="boardTitle">Tag every service before anything is restored.</h2>
        <p class="boardSub" id="boardSub">Red, amber and green will be restored, in the order you
        choose. Black will not be restored at all. That is the whole instrument.</p>
      </div>
      <div class="board-act">
        <button class="act" id="loadPlan">Load the 2019 plan</button>
        <button class="ghost" id="stopHere" hidden>Stop here and count it</button>
        <button class="act" id="startRestore" disabled>Start restoring</button>
      </div>
    </div>

    <div class="lane" id="lane" hidden>
      <div class="lane-box lane-now">
        <span class="lane-l">Validation lane &middot; Lou, one at a time</span>
        <div class="lane-n" id="laneName">Idle</div>
        <div class="lane-bar"><i id="laneBar"></i></div>
        <div class="lane-d" id="laneDays">nothing is being validated</div>
      </div>
      <div class="lane-box lane-q">
        <span class="lane-l">Next up</span>
        <ol class="queue" id="queue"></ol>
      </div>
      <div class="lane-box lane-t">
        <span class="lane-l">Incident clock</span>
        <div class="tbtns">
          <button class="tb tb-run" id="pause">Pause</button>
          <button class="tb sp" data-sp="0.5">0.5&times;</button>
          <button class="tb sp" data-sp="1">1&times;</button>
          <button class="tb sp" data-sp="2">2&times;</button>
          <button class="tb sp" data-sp="4">4&times;</button>
        </div>
      </div>
    </div>

    <p class="prompt" id="prompt" hidden></p>

    <div class="cols" id="cols">
      <div class="col" data-tag="down"><header>Untagged <span id="cDown">0</span></header><div class="drop" id="dDown"></div></div>
      <div class="col" data-tag="red"><header>Red <em>restore first</em> <span id="cRed">0</span></header><div class="drop" id="dRed"></div></div>
      <div class="col" data-tag="amber"><header>Amber <em>restore after</em> <span id="cAmber">0</span></header><div class="drop" id="dAmber"></div></div>
      <div class="col" data-tag="green"><header>Green <em>can wait</em> <span id="cGreen">0</span></header><div class="drop" id="dGreen"></div></div>
      <div class="col col-black" data-tag="black"><header>Black <em>not restoring</em> <span id="cBlack">0</span></header><div class="drop" id="dBlack"></div></div>
    </div>
  </section>

  <!-- ─── stage 05 · reckoning ───────────────────────────────────── -->
  <section class="stage st-reck" data-for="reckoning">
    <div class="reck-grid">
      <div class="reck-race">
        <p class="over">What it cost</p>
        <h2>Your order against the plan&rsquo;s.</h2>
        <div class="race" id="race"></div>
        <p class="reck-note" id="reckNote"></p>
        <div class="paid" id="paid"></div>
      </div>
      <div class="reck-led">
        <p class="over">Signed decisions <span class="chain" id="chainState"></span></p>
        <div class="led" id="led"></div>
        <p class="thin">Hash-chained, so that the decision made at 04:12 still reads the same way in
        the review six months later, and Paul is not the only person holding it.</p>
        <button class="ghost" id="again">Run it again</button>
      </div>
    </div>
  </section>

  <!-- ─── readouts ───────────────────────────────────────────────── -->
  <aside class="meters" id="meters" hidden>
    <div class="m m-rate">
      <span class="m-l">Harm accruing now</span>
      <b class="m-v" id="mRate">0<small>/day</small></b>
      <span class="m-d" id="mRateD">patients per day, while these systems are down</span>
    </div>
    <div class="m">
      <span class="m-l">Patients affected</span>
      <b class="m-v" id="mAff">0</b>
      <span class="m-d">cumulative since 02:14</span>
    </div>
    <div class="m m-sev">
      <span class="m-l">Missed time-critical care</span>
      <b class="m-v" id="mSev">0</b>
      <span class="m-d">stroke, STEMI, transfusion, fractionation</span>
    </div>
  </aside>

  <section class="logwrap" id="logwrap" hidden>
    <div class="log-grip" id="logGrip" title="Drag to resize · double-click to reset"></div>
    <header>Incident log</header>
    <ol class="log" id="log"></ol>
  </section>

</div>

<div class="toast" id="toast" hidden></div>

<script>window.BT = <?= $boot ?>;</script>
<script src="<?= $asset ?>vendor/three.min.js"></script>
<script src="<?= $asset ?>vendor/pp/CopyShader.js"></script>
<script src="<?= $asset ?>vendor/pp/LuminosityHighPassShader.js"></script>
<script src="<?= $asset ?>vendor/pp/EffectComposer.js"></script>
<script src="<?= $asset ?>vendor/pp/RenderPass.js"></script>
<script src="<?= $asset ?>vendor/pp/ShaderPass.js"></script>
<script src="<?= $asset ?>vendor/pp/UnrealBloomPass.js"></script>
<script src="<?= $asset ?>ward.js"></script>
<script src="<?= $asset ?>blacktag.js"></script>
</body>
</html>
