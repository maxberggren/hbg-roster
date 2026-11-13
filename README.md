# Skånska röster

En karta över fyrtio syntetiska röster från nordvästra Skåne. Dra nålen mellan rösterna och hör hur en röst glider över i nästa: varje punkt på kartan är en blandning av de röster som ligger närmast.

Allt körs i webbläsaren. Ingen text och inget ljud skickas någonstans.

## Kör lokalt

Sidan är statisk, men modellen hämtas med `fetch`, så den måste serveras över http:

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```

Den fungerar också på GitHub Pages eller vilken statisk webbhost som helst.

## Vad som finns här

| Fil | Vad |
| --- | --- |
| `index.html` | sidan |
| `js/app.js` | kartan, blandningen och uppspelningen |
| `js/worker.js` | kör talmodellen i en egen tråd |
| `js/frontend.js`, `js/lexicon.js`, `js/patches.js`, `js/neural-phones.js` | text till uttal: svenskt lexikon, skånska ord och regler, och omvandlingen till modellens fonem |
| `modell/roster.onnx` | talmodellen, 20 MB (8-bitars vikter) |
| `modell/roster.json` | modellens inställningar, rösternas namn och deras platser på kartan |
| `ort/` | onnxruntime-web 1.20.1, som kör modellen (wasm) |

## Hur det fungerar

**Modellen** är en Piper/VITS-röst (medium) som utgår från KBLab:s svenska NST-röst. Den har finjusterats på inspelade samtal med människor från Helsingborg med omnejd. Inspelningarna gjordes först om till rena studioversioner av talarnas egna röster, så att rumsljud och brus inte följde med. Modellen har en röstvektor för varje talare och tar en vikt per röst (`mix`, fyrtio tal). Röstvektorn den använder är den viktade summan, och därför går det att röra sig fritt mellan rösterna.

**Kartan.** Varje röst har lästs upp av modellen och jämförts med en röstigenkännare (ECAPA). Avstånden mellan rösterna har lagts ut i två dimensioner med MDS och sedan glesats ut så att inga byar krockar. Ljusare röster hamnade till vänster och mörkare till höger. Blandningen vid nålen är `exp(-d² / 2σ²)` för varje röst, där de sex tyngsta normeras till 1. σ är reglaget "Hur långt en röst når".

**Uttalet** kommer från ett eget lexikon med skånska regler, utan espeak. Modellen har lärt sig skånskan själv av exakt samma indata: diftongerna, de mjuka konsonanterna och ordmelodin.

**Namnen** på rösterna är påhittade.

## Tack

[Piper](https://github.com/OHF-Voice/piper1-gpl) (träningen), [KBLab](https://huggingface.co/KBLab) (den svenska grundrösten) och [onnxruntime-web](https://onnxruntime.ai) (körningen i webbläsaren).
