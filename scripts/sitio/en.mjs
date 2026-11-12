// English pages of the public website (same content as the Spanish ones).
import { DATOS, correo, domicilio, nif, titular } from './comun.mjs';

const L = 'en';
const fecha = `<p class="muted">Last updated: ${DATOS.actualizado.en}</p>`;

export const about = {
  ruta: 'en/',
  otra: 'conoce/',
  titulo: 'Vocify · See, hear and rehearse your group’s voices',
  descripcion: 'Vocify turns scores and recordings into lines of light so every singer can see and hear their part. For vocal groups, choirs and bands.',
  doc: false,
  cuerpo: `
    <section class="hero">
      <div>
        <h1>Your group’s voices, <span>as lines of light</span>.</h1>
        <p class="lead">Upload a score or a recording and Vocify draws every voice as a neon line that rises and falls with the melody. Hear your part, mute the others and rehearse until it clicks.</p>
        <div class="cta"><a class="btn primary" href="../">Open Vocify in your browser</a><a class="btn" href="#how">How it works</a></div>
        <p class="muted" style="margin-top:14px">Free. Works without an account. iPhone app coming soon. The app is in Spanish.</p>
      </div>
      <img class="shot" src="../conoce/img/visualizar.jpg" width="440" height="956" alt="Four voices drawn as coloured neon lines on a dark background" />
    </section>

    <section class="features" id="how">
      <div class="feature"><h3>🎼 Import the score</h3><p>MusicXML (MuseScore, Finale, Sibelius, Flat…) or MIDI, with repeats, ties and chords.</p></div>
      <div class="feature"><h3>🎙️ Or a recording</h3><p>WAV, MP3, M4A, OGG, FLAC… Vocify listens to the audio on your device and turns it into voices you can then fix.</p></div>
      <div class="feature"><h3>🌈 See every voice</h3><p>Each voice is a coloured line with its name. See at a glance who goes up, who goes down and where you cross.</p></div>
      <div class="feature"><h3>🎧 Rehearse yours</h3><p>Solo or mute per voice, slow speed, metronome, count-in and loops for the tricky bars.</p></div>
      <div class="feature"><h3>✏️ Edit and compose</h3><p>Add, move and stretch notes with your finger; change chords, transpose and undo. Or hum a tune and it becomes notes.</p></div>
      <div class="feature"><h3>👥 Share with your group</h3><p>Create the group, invite with a code and songs sync for everyone.</p></div>
      <div class="feature"><h3>🤖 Arranging assistant</h3><p>Checks crossings and leaps, suggests chords and writes new voices. With AI (Claude) for richer ideas.</p></div>
      <div class="feature"><h3>🎸 Chords for instruments</h3><p>Optionally shows how to play each chord on guitar, ukulele or piano.</p></div>
      <div class="feature"><h3>📱 Video for social media</h3><p>Record a vertical video with the lines and the sound, ready to share.</p></div>
    </section>

    <section class="band">
      <h2>Your songs are yours</h2>
      <p class="muted">No ads and no tracking. Without an account everything stays on your device; microphone audio and recordings are analysed right there and never uploaded. <a href="privacy/">Privacy policy</a>.</p>
      <p><a class="btn primary" href="../">Start now</a></p>
    </section>`,
};

export const privacy = {
  ruta: 'en/privacy/',
  otra: 'privacidad/',
  titulo: 'Vocify · Privacy policy',
  descripcion: 'What data Vocify processes, why, with whom and how to delete it.',
  cuerpo: `
      <h1>Privacy policy</h1>
      ${fecha}
      <p class="muted">This is a translation; if there is any discrepancy, the <a href="../../privacidad/">Spanish version</a> prevails.</p>

      <div class="box"><b>In short:</b> you can use Vocify without an account, and then everything stays on your device. The microphone and the recordings you import are analysed on your device and never uploaded. If you create an account, we keep only what the group features and the AI need. No ads, no tracking, and we don’t sell data. You can download your data and delete your account from the app.</div>

      <h2>1. Controller</h2>
      <p>The controller is ${titular(L)}, tax ID ${nif(L)}, address ${domicilio(L)} (“Vocify”, “we”). For any privacy matter, write to ${correo()}.</p>

      <h2>2. What data we process</h2>
      <h3>Using Vocify without an account</h3>
      <p>Your songs and settings are stored only on your device (browser or app storage). We receive nothing.</p>
      <h3>Microphone (“Hum”)</h3>
      <p>With your permission, the app listens to the microphone to detect the pitch of the notes you sing. <b>The audio is analysed in real time on your device, never saved to a file and never sent to any server.</b> Only the resulting notes are stored in your song.</p>
      <h3>Recordings you import</h3>
      <p>When you turn an audio file (WAV, MP3…) into voices, the analysis runs on your device with a model shipped with the app. The audio file is not uploaded anywhere.</p>
      <h3>If you create an account (optional)</h3>
      <ul>
        <li><b>Email address</b> and, if you use one, your <b>password</b> (stored hashed by our authentication provider; we can’t see it).</li>
        <li><b>Display name</b>, visible to the members of your groups.</li>
        <li>If you use <b>Sign in with Apple</b>: the identifier Apple gives us, the email Apple shares (it may be a private Apple relay address) and your name the first time. We also keep, <b>encrypted</b>, an Apple code used only to revoke that access when you delete your account.</li>
        <li>The <b>groups</b> you belong to, your role (creator or member) and the invite code.</li>
        <li><b>Songs you share with a group</b> (title, notes, chords, voice names and colours) and who last changed them.</li>
        <li><b>AI usage</b>: the date and time of each request, only to enforce the daily limit.</li>
      </ul>
      <h3>AI assistant</h3>
      <p>When you ask the AI something, we send your request and a text description of the open song (notes, chords, voice names and tempo) to Anthropic, which provides the Claude model, to generate the answer. We don’t send your email, your name or any audio. The assistant’s “Review”, “Chords” and “Create voices” features run on your device and send nothing.</p>
      <h3>Technical data</h3>
      <p>Like any Internet service, our hosting providers automatically log technical data about each connection (IP address, date, page requested, browser type) to keep the service secure and fix errors. We don’t use it to profile you.</p>

      <h2>3. Purposes and legal bases</h2>
      <div class="table-wrap"><table>
        <tr><th>Purpose</th><th>Legal basis (GDPR)</th></tr>
        <tr><td>Creating and keeping your account, groups and shared songs</td><td>Performance of the contract you accept when signing up (Art. 6(1)(b))</td></tr>
        <tr><td>Answering your AI requests</td><td>Performance of the contract (Art. 6(1)(b))</td></tr>
        <tr><td>AI daily limit, security and abuse prevention</td><td>Legitimate interest in a stable and secure service (Art. 6(1)(f))</td></tr>
        <tr><td>Microphone use</td><td>Your permission on the device, which you can withdraw at any time in settings</td></tr>
        <tr><td>Handling your enquiries and rights requests</td><td>Legal obligation and performance of the contract (Art. 6(1)(c) and (b))</td></tr>
      </table></div>
      <p>We make no automated decisions with legal effects on you and we don’t build profiles.</p>

      <h2>4. Who we share data with</h2>
      <p>Only the technical providers we need to run the service, acting as processors under contract:</p>
      <div class="table-wrap"><table>
        <tr><th>Provider</th><th>Purpose</th><th>Where</th></tr>
        <tr><td>Supabase, Inc.</td><td>Accounts, sign-in, database of groups and songs</td><td>European Union (Frankfurt, Germany)</td></tr>
        <tr><td>Render Services, Inc.</td><td>App server and website hosting</td><td>European Union (Frankfurt, Germany); the static website is served from its global delivery network</td></tr>
        <tr><td>Anthropic Ireland, Limited</td><td>Claude AI model, only when you use the AI assistant</td><td>United States</td></tr>
        <tr><td>Apple Distribution International Ltd.</td><td>Sign in with Apple and app distribution, if you use them</td><td>Per Apple’s own policy</td></tr>
        <tr><td>GitHub, Inc.</td><td>Mirror of the website on GitHub Pages (only if you use that address)</td><td>United States</td></tr>
      </table></div>
      <p>Members of your groups see your display name and the songs you share in that group. We don’t sell or give your data to anyone else, except where required by law.</p>

      <h2>5. Transfers outside the EU</h2>
      <p>When you use the AI assistant, your request is processed in the United States. In its data processing agreement Anthropic commits to the Standard Contractual Clauses approved by the European Commission (Decision 2021/914). Other US-based providers likewise apply GDPR safeguards (Standard Contractual Clauses or other valid mechanisms) for any access from outside the EU.</p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li><b>Account, name and groups:</b> while you have the account. They are deleted with it.</li>
        <li><b>AI usage log:</b> 30 days, then deleted automatically.</li>
        <li><b>Apple code:</b> until you delete your account and the access is revoked.</li>
        <li><b>AI requests at Anthropic:</b> deleted by Anthropic within 30 days, unless flagged for usage-policy violations (up to 2 years) or required by law. They are not used to train its models.</li>
        <li><b>Shared songs:</b> they belong to the group. If you delete your account or leave the group, the songs you shared remain available to the other members, without your name. You can remove them from the group beforehand in <i>My songs</i> (⊘ button). A group and its songs are deleted when its last member leaves.</li>
        <li><b>Technical connection data:</b> for the limited time our providers keep it for security.</li>
      </ul>

      <h2>7. Download your data and delete your account</h2>
      <p>In the app: <i>Menu → Group and account</i>.</p>
      <ul>
        <li><b>Download my data</b> gives you a file with your account, your groups and the shared songs.</li>
        <li><b>Delete my account</b> deletes your email, name, group memberships and AI usage log, and revokes Sign in with Apple if you used it. Songs stored only on your device are not touched.</li>
      </ul>
      <p>If you can’t get into the app, follow the steps to <a href="../delete-account/">delete your account</a>.</p>

      <h2>8. Your rights</h2>
      <p>You can exercise your rights of access, rectification, erasure, objection, restriction and portability by writing to ${correo()} from your account’s email address. We will reply within one month. If you think we haven’t handled your request properly, you can complain to the Spanish Data Protection Agency (<a href="https://www.aepd.es">www.aepd.es</a>) or your local authority.</p>

      <h2>9. Security</h2>
      <p>All connections are encrypted (HTTPS). The database enforces row-level access rules: each person can only read their own groups and those groups’ songs. Server keys never leave the server, and the Apple code is stored encrypted.</p>

      <h2>10. Ads and tracking</h2>
      <p>Vocify shows no ads, uses no third-party analytics, doesn’t track you across apps or websites and uses no tracking cookies. It only uses the device’s local storage for your songs, settings and session.</p>

      <h2>11. Children</h2>
      <p>You must be at least 14 (or have your parents’ or guardians’ consent) to create an account. Without an account the app collects no personal data.</p>

      <h2>12. Changes</h2>
      <p>If we change this policy we will update the date above and, for important changes, let you know in the app.</p>`,
};

export const terms = {
  ruta: 'en/terms/',
  otra: 'condiciones/',
  titulo: 'Vocify · Terms of use',
  descripcion: 'Terms of use of Vocify.',
  cuerpo: `
      <h1>Terms of use</h1>
      ${fecha}
      <p class="muted">This is a translation; if there is any discrepancy, the <a href="../../condiciones/">Spanish version</a> prevails.</p>

      <h2>1. Who we are</h2>
      <p>Vocify is a service of ${titular(L)}, tax ID ${nif(L)}, address ${domicilio(L)}. Contact: ${correo()}.</p>

      <h2>2. What Vocify is</h2>
      <p>Vocify is an app (web and mobile) to see, hear, compose and rehearse the voices of a song. It’s free and can be used without an account. With an account you can also create groups, share songs and use the AI assistant.</p>

      <h2>3. Your account</h2>
      <ul>
        <li>You must be at least 14 or have your parents’ or guardians’ consent.</li>
        <li>The information you give must be accurate and your password kept secret. You are responsible for what is done with your account.</li>
        <li>You can delete your account at any time from the app.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>The songs, arrangements and recordings you create or import are yours. So that we can store them and show them to the members of your groups, you allow us to host and process them, only for that purpose and while they are in the service.</p>
      <p>You must have the right to use what you import or share. Many scores and recordings are copyrighted: share them only within your group and within the law. If someone tells us that content infringes their rights, we may remove it.</p>

      <h2>5. Acceptable use</h2>
      <p>Don’t use Vocify for illegal activities, to harass others, to try to access other people’s data, to overload or attack the service, or to scrape data.</p>

      <h2>6. AI assistant and audio conversion</h2>
      <p>The assistant’s suggestions (including the AI’s) and the notes obtained from a recording or from humming are approximations that may contain mistakes. Check them before using them. The AI assistant has a daily request limit per person.</p>

      <h2>7. The service</h2>
      <p>Vocify is provided free of charge and as is. We do our best to keep it working well and without interruptions, but there may be failures or maintenance downtime, and features may change. We recommend keeping a copy of your songs (<i>Menu → Export project</i>). We may suspend accounts that breach these terms.</p>

      <h2>8. Liability</h2>
      <p>We are not liable for indirect damages or for loss of content not caused by our fault or negligence. Nothing in these terms limits your rights under consumer protection law.</p>

      <h2>9. App Store app</h2>
      <p>If you use the iPhone app, Apple’s standard licensed application end user license agreement (EULA) also applies. Apple is not responsible for the service or its support.</p>

      <h2>10. Changes</h2>
      <p>We may update these terms. For important changes we will let you know in the app in advance. If you don’t agree, you can stop using Vocify and delete your account.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by Spanish law. If you are a consumer, you may go to the courts of your place of residence.</p>

      <p>We process your data according to the <a href="../privacy/">privacy policy</a>.</p>`,
};

export const support = {
  ruta: 'en/support/',
  otra: 'soporte/',
  titulo: 'Vocify · Help and contact',
  descripcion: 'Frequently asked questions and contact for Vocify.',
  cuerpo: `
      <h1>Help and contact</h1>
      <p>Something not working, or have an idea? Write to ${correo()}. Telling us your device and what you were doing helps us fix it sooner. (The app is in Spanish; we answer in Spanish or English.)</p>

      <h2>Frequently asked questions</h2>
      <details><summary>Which files can I import?</summary><p>Scores in <b>MusicXML</b> (.musicxml, .xml, .mxl) and <b>MIDI</b> (.mid), and audio recordings (<b>WAV, MP3, M4A, AAC, OGG, OPUS, FLAC, AIFF</b>…). From MuseScore: <i>File → Export → MusicXML</i>. On iPhone you can also open a score or audio from WhatsApp, Mail or Files with “Share → Vocify”.</p></details>
      <details><summary>How do I turn a recording into voices?</summary><p>Tap <i>Import</i> and pick the audio. Say how many voices can be heard (or let Vocify guess) and wait a moment: the analysis runs on your device. It works best with voices alone (a cappella), no instruments and little reverb. The result is a starting point: fix any wrong notes in the editor.</p><p>If each singer records their part separately (all starting at the same point), import the first one and then the others choosing <i>Add to “…” as a new voice</i>: they end up together in one song, and come out much better than the whole group on a single track.</p></details>
      <details><summary>How do I rehearse just my voice?</summary><p>In the voices panel, tap <b>S</b> (solo) on your voice or turn the others down. The rehearse button (⇄) loops a few bars, with metronome, count-in and slow speed.</p></details>
      <details><summary>How do I share songs with my group?</summary><p>Create an account, go to <i>Menu → Group and account</i>, create the group and send the invite code. Then, with the song open, tap <i>Share “…” with the group</i> in that same panel. Changes sync automatically.</p></details>
      <details><summary>Do I need an Internet connection?</summary><p>Not to view, play, edit or hum: all of that works offline. Audio conversion always works offline in the app; in the browser it needs a connection the first time, to download the model. Sharing with the group and the AI assistant need a connection.</p></details>
      <details><summary>No sound on iPhone</summary><p>Turn the volume up and check no voice is muted in the voices panel. The iPhone app plays even with the silent switch on; in the iPhone browser, turn silent mode off.</p></details>
      <details><summary>Is there an AI limit?</summary><p>Yes, a number of requests per person per day, so the service can stay free. The assistant features that don’t use AI have no limit.</p></details>
      <details><summary>How do I download my data or delete my account?</summary><p>In <i>Menu → Group and account</i>: <b>Download my data</b> or <b>Delete my account</b>. More details on <a href="../delete-account/">deleting your account</a>.</p></details>

      <h2>More information</h2>
      <p><a href="../privacy/">Privacy policy</a> · <a href="../terms/">Terms of use</a></p>`,
};

export const deleteAccount = {
  ruta: 'en/delete-account/',
  otra: 'borrar-cuenta/',
  titulo: 'Vocify · Delete your account',
  descripcion: 'How to delete your Vocify account and what data is deleted.',
  cuerpo: `
      <h1>Delete your Vocify account</h1>
      <h2>From the app (fastest)</h2>
      <ol>
        <li>Open Vocify (on iPhone or in <a href="../../">the browser</a>) and sign in.</li>
        <li>Go to <i>Menu → Group and account</i> (“Grupo y cuenta”).</li>
        <li>Tap <b>Delete my account</b> (“Eliminar mi cuenta”) and confirm.</li>
      </ol>
      <p>If you want to keep a copy, tap <b>Download my data</b> (“Descargar mis datos”) first.</p>

      <h2>If you can’t sign in</h2>
      <p>Email ${correo()} from your account’s address with the subject “Delete my account”. We will delete it within one month and confirm it to you.</p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your email, password and display name.</li>
        <li>Your membership of all groups.</li>
        <li>The AI usage log.</li>
        <li>Sign in with Apple access, which is revoked with Apple.</li>
      </ul>
      <h2>What remains</h2>
      <ul>
        <li>Songs stored on your device (they stay there; delete them in <i>My songs</i> or by uninstalling the app).</li>
        <li>Songs you shared with a group, which remain available to its members without your name. If you don’t want them to stay, remove them from the group first (<i>My songs</i>, ⊘ button). If you were the only member, the group and its songs are deleted.</li>
      </ul>`,
};

export const PAGINAS_EN = [about, privacy, terms, support, deleteAccount].map((p) => ({ ...p, lang: L }));
