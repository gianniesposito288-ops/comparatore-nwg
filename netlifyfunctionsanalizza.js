exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key non configurata' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Richiesta non valida' }) };
  }

  const { image, mediaType } = body;
  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nessuna immagine ricevuta' }) };
  }

  const prompt = `Sei un esperto di bollette energia elettrica italiane. Analizza questa bolletta e restituisci SOLO un oggetto JSON con questi valori esatti, senza nessun testo aggiuntivo:

{
  "fornitore": "nome del fornitore",
  "tipo_tariffa": "MONORARIO" oppure "MULTIORARIO",
  "prezzo_mono": numero in €/kWh (se monorario, altrimenti 0),
  "prezzo_f1": numero in €/kWh (se multiorario, altrimenti 0),
  "prezzo_f2": numero in €/kWh (se multiorario, altrimenti 0),
  "prezzo_f3": numero in €/kWh (se multiorario, altrimenti 0),
  "quota_fissa": numero in €/mese (solo parte vendita, NON rete),
  "consumo_annuo": numero in kWh (totale annuo),
  "consumo_f1": numero in kWh annui (se multiorario, altrimenti 0),
  "consumo_f2": numero in kWh annui (se multiorario, altrimenti 0),
  "consumo_f3": numero in kWh annui (se multiorario, altrimenti 0),
  "tipologia": "DOMESTICO" oppure "ALTRI USI"
}

Regole importanti:
- prezzo_mono: dalla voce Quota per consumi -> Prezzo medio (se monorario)
- prezzo_f1/f2/f3: dal Box offerta -> prezzi per fascia (se multiorario)  
- quota_fissa: dalla voce Quota fissa -> SOLO la sotto-riga "di cui spesa per la vendita" in €/mese
- consumo_annuo: dalla sezione Consumo annuo o Informazioni storiche, dato su 12 mesi
- Se non riesci a trovare un valore metti 0
- Rispondi SOLO con il JSON, nessuna parola in più`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Errore API: ' + (data.error?.message || 'sconosciuto') }) 
      };
    }

    const text = data.content[0].text.trim();
    
    // Estrai JSON dalla risposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Risposta non valida dall\'AI' }) };
    }

    const result = JSON.parse(jsonMatch[0]);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch(e) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Errore: ' + e.message }) 
    };
  }
};
