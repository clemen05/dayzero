// HU-18 / HU-19 · Narración de cada día.
// - Si hay ANTHROPIC_API_KEY, pide a Claude un texto de 120 palabras como máximo, en segunda persona.
// - Se descarta el texto (y se usa el de reserva) si: tarda más de 5 s, falla, pasa de 120 palabras,
//   no menciona la ciudad o escribe una cifra que no viene del motor.
// - Sin clave, siempre se usa el texto de reserva. El jugador nunca ve un error.
const TIEMPO_MAX_MS = Number(process.env.NARRADOR_TIMEOUT_MS) || 5000;
const MODELO = process.env.NARRADOR_MODELO || 'claude-haiku-5-5';
const API_URL = process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages';

const RESERVA = {
  es: {
    1: 'Aterrizas en {ciudad} con {anterior} todavía en la cabeza y la maleta tirando de tu brazo. Huele distinto, suena distinto y nadie te espera en la salida. Hoy toca lo básico: encontrar dónde vas a vivir, llegar hasta allí y comer algo antes de caer rendido. Cada decisión cuenta, y esta ciudad no regala nada.',
    2: 'Te despiertas en {ciudad} y por un segundo no sabes dónde estás. Ayer elegiste {anterior}; hoy toca papeleo. Sin estar registrado y sin un número de teléfono local no eres nadie aquí: ni banco, ni contrato, ni nómina. Respira hondo, coge tus documentos y sal a la calle.',
    3: 'Primer día de trabajo en {ciudad}. Después de {anterior}, hoy por fin empieza la parte que justifica todo esto. Caras nuevas, una mesa que todavía no es tuya y la pregunta de siempre: cómo llegas y qué comes. Pequeñas decisiones que, sumadas, dicen cuánto te va a costar esta vida.',
    4: 'Hoy en {ciudad} toca firmar. Tras {anterior}, te sientas frente al contrato del piso y la cifra de la fianza te mira sin pestañear. Es el día de las llaves, pero también el de vaciar la cuenta. Y luego, claro, una casa vacía que hay que convertir en hogar.',
    5: 'El día que nadie planifica llega en {ciudad}. Vuelves a casa después de {anterior} y la puerta no se abre: las llaves se han quedado dentro. Es de noche, hace frío y no conoces a casi nadie. Lo que hagas ahora decide cómo duermes hoy y cuánto te dura el dinero.',
    6: 'Primer fin de semana en {ciudad}. Después de {anterior}, por fin tienes tiempo para ti. La ciudad está llena de planes, pero tu cartera ya ha notado la semana. Puedes salir, conocer gente o quedarte en casa recuperando fuerzas. Aquí también se juega tu bienestar.',
    7: 'Último día de tu primera semana en {ciudad}. Repasas lo vivido, desde {anterior} hasta este momento, y miras el saldo de tu cuenta con otros ojos. Quedan un par de decisiones para cerrar la semana y preparar el mes que viene. Mañana empieza la vida normal.',
  },
  en: {
    1: 'You land in {ciudad} with {anterior} still on your mind and your suitcase pulling at your arm. It smells different, it sounds different and nobody is waiting for you at arrivals. Today is about the basics: finding where you will live, getting there and eating something before you collapse. Every choice counts, and this city gives nothing away.',
    2: 'You wake up in {ciudad} and for a second you do not know where you are. Yesterday you went for {anterior}; today is paperwork. Without registering and without a local phone number you are nobody here: no bank, no contract, no payslip. Take a deep breath, grab your documents and head out.',
    3: 'First day at work in {ciudad}. After {anterior}, the part that justifies all this finally begins. New faces, a desk that is not yours yet and the usual questions: how do you get there and what do you eat. Small choices that add up to what this life will cost you.',
    4: 'Today in {ciudad} you sign. After {anterior}, you sit in front of the tenancy agreement and the deposit stares back at you. It is the day you get the keys, and also the day your account empties. And then there is an empty flat to turn into a home.',
    5: 'The day nobody plans for arrives in {ciudad}. You come home after {anterior} and the door will not open: your keys are inside. It is late at night, it is cold and you barely know anyone. What you do now decides how you sleep tonight and how long your money lasts.',
    6: 'Your first weekend in {ciudad}. After {anterior}, you finally have time for yourself. The city is full of plans, but your wallet has felt the week. You can go out, meet people or stay in and recover. Your wellbeing is at stake here too.',
    7: 'The last day of your first week in {ciudad}. You look back at everything, from {anterior} to right now, and see your bank balance with new eyes. A couple of choices remain to close the week and get ready for next month. Tomorrow, normal life begins.',
  },
};

function textoReserva({ dia, lang, ciudad, anterior }) {
  const t = (RESERVA[lang] || RESERVA.es)[dia] || RESERVA.es[1];
  return t.replace('{ciudad}', ciudad).replace('{anterior}', anterior);
}

const palabras = (t) => t.trim().split(/\s+/).filter(Boolean).length;
/* Todas las cifras del texto tienen que estar en la lista que da el motor (HU-18 esc. 2). */
function cifrasValidas(texto, permitidas) {
  const ok = new Set((permitidas || []).map(String));
  const encontradas = texto.match(/\d+(?:[.,]\d+)*/g) || [];
  return encontradas.every((n) => {
    const limpio = n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    const v = Math.round(Number(limpio));
    return ok.has(String(v)) || ok.has(n);
  });
}
function validar(texto, { ciudad, permitidas }) {
  if (!texto || typeof texto !== 'string') return 'vacio';
  if (palabras(texto) > 120) return 'largo';
  if (!texto.toLowerCase().includes(String(ciudad).toLowerCase())) return 'sin_ciudad';
  if (!cifrasValidas(texto, permitidas)) return 'cifra_inventada';
  return null;
}

async function pedirIA(datos) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { texto: null, motivo: 'sin_clave' };
  const idioma = datos.lang === 'en' ? 'English' : 'español de España';
  const prompt = [
    `Escribe en ${idioma} la narración del día ${datos.dia} de 7 de la primera semana de una persona que se acaba de mudar a ${datos.ciudad}.`,
    `Tema del día: ${datos.tema}. Su decisión anterior fue: ${datos.anterior}.`,
    'Reglas: segunda persona; máximo 100 palabras; menciona la ciudad por su nombre y la decisión anterior;',
    'no escribas ninguna cifra, precio ni número (ni con letras); sin títulos ni comillas; un solo párrafo.',
  ].join(' ');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIEMPO_MAX_MS);
  try {
    const r = await fetch(API_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return { texto: null, motivo: `http_${r.status}` };
    const j = await r.json();
    const texto = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { texto };
  } catch (e) {
    return { texto: null, motivo: e.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/* datos = { dia, lang, ciudad, anterior, tema, permitidas[] } -> { texto, fuente: 'ia'|'reserva', motivo? } */
async function narrar(datos) {
  const ia = await pedirIA(datos);
  if (ia.texto) {
    const fallo = validar(ia.texto, datos);
    if (!fallo) return { texto: ia.texto, fuente: 'ia' };
    return { texto: textoReserva(datos), fuente: 'reserva', motivo: fallo };
  }
  return { texto: textoReserva(datos), fuente: 'reserva', motivo: ia.motivo };
}

module.exports = { narrar, textoReserva, validar, cifrasValidas, RESERVA, TIEMPO_MAX_MS };
