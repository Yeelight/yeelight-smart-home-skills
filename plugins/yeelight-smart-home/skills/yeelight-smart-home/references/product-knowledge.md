# Product Knowledge

Use this reference for Yeelight product consultation, pedia search, manuals, FAQ candidates, material-code resources, attachments, and product specification questions.

## Intent Routing

- Use `product.pedia.search` for product information by fuzzy wording, product name, short name, material code, SKU, SPU, model, model number, barcode, manual, FAQ, installation guide, user guide, product image, product资料, or product简介.
- Put the most specific user phrase into `parameters.multiField`. Prefer material code first, then model/SKU, then exact product name, then the user's fuzzy keyword.
- Accept semantic parameter aliases when the user states them clearly: materialCode, productModel, model, productName, sku, keyword, query, name, pid.
- Keep the original user text in `utterance`; Runtime can use it as the fallback query if parameters are incomplete.
- Use `thing.product.info.batch_get`, `thing.product.info.v3.batch_get`, and `thing.schema.*` only for product model/schema questions where the user provides product ids or asks about capability vocabulary.
- Do not treat pedia results as proof that a device is installed or controllable in the user's home. Use `entity.capabilities`, `entity.list`, or `state.query` for installed-device truth.

## Response Rules

- Summarize by productName, productShortName, materialCode, productModel, productSku, productSpu, productBrand, category/class fields, support markers, status, and available resources. Do not dump every raw field by default.
- Preserve uncertainty when a field is absent or null. Say “资料中未给出” instead of inventing support, sale status, FAQ, or manual facts.
- Treat product-level attachments and resources attachments as source-returned records. Attachments whose type or name indicates 说明书/manual are stronger than candidate URLs.
- Treat manualCandidateUrl and faqCandidateUrl as predictable candidate resources. If Runtime marks candidate status as unverified, present them as possible resources, not guaranteed files.
- If multiple products match a broad keyword such as “青空灯”, give the most relevant few and ask whether the user wants a specific material code, model, or manual/FAQ.
- For “这个产品支持 Yeelight Pro/HomeKit 吗”, answer from isSupportYeelightPro and isSupportHomekit only when Runtime returns those fields.
- Never construct raw API requests, expose credential headers, or ask the user for a token. Always call Runtime through `scripts/invoke`.

## Product Advice Boundary

- Product pedia is for consultation, manuals, FAQs, images, category, material code, model, support markers, and resources.
- Lighting design product selection uses `assets/catalog/lighting-design-products.json` through `node scripts/product-select.mjs`. Use it to choose design-slot candidates from user wording, then use `product.pedia.search` only when official product facts or resources are needed.
- Product pedia is not a substitute for installed-home topology. Do not say "你的客厅有这个产品" unless Runtime returns installed entity evidence.
- If the user asks "能不能控制/自动化/加入场景", answer in two layers: product information may indicate a possible feature, but installed device support must be checked by `entity.capabilities` or the relevant Runtime intent.
- If the user asks installation, wiring, or compatibility advice, keep it as informational and recommend official manual or installer verification when safety or wiring is involved.
- If the user asks for FAQ content and Runtime returns only a candidate resource, say it may need opening or later verification instead of claiming the FAQ exists.

## Design Candidate Catalog

- The design candidate catalog is a compact, release-safe smart product list with material codes, product names, SKU/SPU, pid, component id, product category, series, controllable properties, property events, sensor events, aliases, design attributes, design roles, design keywords, and capability tags.
- Retrieve candidates with:

```bash
node scripts/product-select.mjs --query "白色嵌入式射灯" --room "客厅" --goal "全屋照明设计" --limit 8
```

- Choose the final candidate by combining:
  - the user's explicit wording and `requestedSignals`;
  - `constraintReview.matched` and `constraintReview.missing`;
  - `designAttributes` such as color, install style, beam angle, opening, size, head count, wattage, and shape;
  - `designRoles` such as ambient, accent, task, focused, comfort, control, sensing, covering, or climate;
  - `designKeywords` such as version, short-name, or product-positioning words;
  - `capabilityTags` such as power, brightness, colorTemperature, color, openPercent, or sensorEvents;
  - the room role and the design goal.
- Do not select only because a string matched first. The script recalls candidates and organizes evidence; the AI must make the final design judgment.
- For a full design import, pass the chosen `materialCode`, `pid`, `pcId`, `productName`, `productSku`, `productSpu`, `category`, and `series` in the slot item so Runtime receives explicit product identity.
- Keep a short note such as "AI chose this as a black embedded grille accent candidate" or "AI assumed 75 opening 36° S-series spot for bedroom focus lighting" when importing design slots. This makes later review and installer handoff auditable.

## Answer Shape

- Broad query: list up to a few likely matches with product name, material code, model, category, status, and resource availability.
- Exact material/model query: focus on that product and include manual/FAQ/attachment availability when present.
- Comparison query: compare only returned fields; mark missing fields as unknown.
- Resource query: return manual/FAQ/image/resource links only as Runtime-returned resources or Runtime-labeled candidates.

## Natural Language Mapping

| User wording | Intent | Parameters |
| --- | --- | --- |
| 青空灯有什么资料 / 青空灯说明书 | `product.pedia.search` | `multiField: "青空灯"` |
| 查 1-000003268 的说明书 | `product.pedia.search` | multiField: "1-000003268", materialCode: "1-000003268" |
| YP-0117 是什么产品 | `product.pedia.search` | multiField: "YP-0117", productModel: "YP-0117" |
| Yeelight Pro Nightingale 青空灯夙夜版 FAQ | `product.pedia.search` | `multiField: "Yeelight Pro Nightingale青空灯夙夜版"` |
| YLP-Nightingale青空灯-夙夜版有图和说明书吗 | `product.pedia.search` | `multiField: "YLP-Nightingale青空灯-夙夜版"`, `sku: "YLP-Nightingale青空灯-夙夜版"` |

## Example SkillRequest Shape

```json
{
  "contractVersion": "1.0",
  "requestId": "generated-id",
  "locale": "zh-CN",
  "utterance": "帮我查一下青空灯说明书和常见问题",
  "intent": "product.pedia.search",
  "parameters": {
    "multiField": "青空灯"
  }
}
```
