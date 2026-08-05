use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApiProvider {
    Deepl,
    Google,
    Bing,
    Lara,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateRequest {
    pub text: String,
    pub from: String,
    pub to: String,
    pub api: ApiProvider,
    pub api_key: String,
    #[serde(default)]
    pub use_free_api: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateResponse {
    pub translated_text: String,
    pub detected_language: Option<String>,
    pub alternatives: Vec<String>,
}

#[tauri::command]
pub async fn translate_text(request: TranslateRequest) -> Result<TranslateResponse, String> {
    let client = reqwest::Client::new();

    match request.api {
        ApiProvider::Deepl => Deepl::translate(&client, &request).await,
        ApiProvider::Google => Google::translate(&client, &request).await,
        ApiProvider::Bing => Bing::translate(&client, &request).await,
        ApiProvider::Lara => Lara::translate(&client, &request).await,
    }
}

#[tauri::command]
pub async fn validate_api_key(api: ApiProvider, api_key: String) -> Result<bool, String> {
    let client = reqwest::Client::new();

    match api {
        ApiProvider::Deepl => Deepl::validate(&client, &api_key).await,
        ApiProvider::Google => Google::validate(&client, &api_key).await,
        ApiProvider::Bing => Bing::validate(&client, &api_key).await,
        ApiProvider::Lara => Lara::validate(&client, &api_key).await,
    }
}

trait TranslationProvider {
    async fn translate(
        client: &reqwest::Client,
        req: &TranslateRequest,
    ) -> Result<TranslateResponse, String>;
    async fn validate(client: &reqwest::Client, api_key: &str) -> Result<bool, String>;
}

struct Deepl;
struct Google;
struct Bing;
struct Lara;

// deepl

#[derive(Deserialize)]
struct DeepLResponse {
    translations: Vec<DeepLTranslation>,
}

#[derive(Deserialize)]
struct DeepLTranslation {
    text: String,
    detected_source_language: Option<String>,
    #[serde(default)]
    alternatives: Vec<String>,
}

impl TranslationProvider for Deepl {
    async fn translate(
        client: &reqwest::Client,
        req: &TranslateRequest,
    ) -> Result<TranslateResponse, String> {
        let key = req.api_key.trim();
        let base_url = if key.ends_with(":fx") {
            "https://api-free.deepl.com/v2"
        } else {
            "https://api.deepl.com/v2"
        };

        let mut params = vec![
            ("text", req.text.clone()),
            ("target_lang", req.to.to_uppercase()),
        ];
        if req.from != "auto" {
            params.push(("source_lang", req.from.to_uppercase()));
        }

        let response = client
            .post(&format!("{}/translate", base_url))
            .header("Authorization", format!("DeepL-Auth-Key {}", key))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("DeepL request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "DeepL API error ({}): {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        let body: DeepLResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse DeepL response: {}", e))?;
        let translation = body
            .translations
            .first()
            .ok_or("No translation found in DeepL response")?;

        Ok(TranslateResponse {
            translated_text: translation.text.clone(),
            detected_language: translation
                .detected_source_language
                .as_ref()
                .map(|s| s.to_lowercase()),
            alternatives: translation.alternatives.clone(),
        })
    }

    async fn validate(client: &reqwest::Client, api_key: &str) -> Result<bool, String> {
        let key = api_key.trim();
        let base_url = if key.ends_with(":fx") {
            "https://api-free.deepl.com/v2"
        } else {
            "https://api.deepl.com/v2"
        };
        let response = client
            .get(&format!("{}/usage", base_url))
            .header("Authorization", format!("DeepL-Auth-Key {}", key))
            .send()
            .await
            .map_err(|e| format!("DeepL validation failed: {}", e))?;
        Ok(response.status().is_success())
    }
}

// google

impl TranslationProvider for Google {
    async fn translate(
        client: &reqwest::Client,
        req: &TranslateRequest,
    ) -> Result<TranslateResponse, String> {
        let sl = if req.from == "auto" { "auto" } else { &req.from };

        let response = client
            .get("https://translate.googleapis.com/translate_a/single")
            .query(&[
                ("client", "gtx"),
                ("sl", sl),
                ("tl", &req.to),
                ("dt", "t"),
                ("dt", "bd"),
                ("dt", "at"),
                ("q", &req.text),
            ])
            .send()
            .await
            .map_err(|e| format!("Google request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Google API error ({}): {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Google response: {}", e))?;

        let translated_text = body
            .get(0)
            .and_then(|arr| arr.as_array())
            .map(|segments| {
                segments
                    .iter()
                    .filter_map(|seg| seg.get(0).and_then(|t| t.as_str()))
                    .collect::<String>()
            })
            .ok_or("No translation found in Google response")?;

        let detected_language = body
            .get(2)
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());

        let alternatives = {
            let mut seen = std::collections::HashSet::new();
            let mut alts: Vec<String> = Vec::new();

            let add_alt = |s: &str, seen: &mut std::collections::HashSet<String>, alts: &mut Vec<String>| {
                let cleaned = s.trim().to_string();
                if !cleaned.is_empty() && cleaned != translated_text && seen.insert(cleaned.clone()) {
                    alts.push(cleaned);
                }
            };

            if let Some(groups) = body.get(1).and_then(|v| v.as_array()) {
                for group in groups {
                    if let Some(terms) = group.get(1).and_then(|t| t.as_array()) {
                        for term in terms {
                            if let Some(s) = term.as_str() {
                                add_alt(s, &mut seen, &mut alts);
                            }
                        }
                    }
                }
            }

            if let Some(phrase_groups) = body.get(5).and_then(|v| v.as_array()) {
                for group in phrase_groups {
                    if let Some(terms) = group.get(2).and_then(|t| t.as_array()) {
                        for term in terms {
                            if let Some(s) = term.get(0).and_then(|t| t.as_str()) {
                                add_alt(s, &mut seen, &mut alts);
                            }
                        }
                    }
                }
            }

            fn extract_strings(v: &serde_json::Value, seen: &mut std::collections::HashSet<String>, alts: &mut Vec<String>, main_text: &str) {
                match v {
                    serde_json::Value::String(s) => {
                        let cleaned = s.trim().to_string();
                        if !cleaned.is_empty() && cleaned.len() > 1 && cleaned != main_text && seen.insert(cleaned.clone()) {
                            alts.push(cleaned);
                        }
                    }
                    serde_json::Value::Array(arr) => {
                        for item in arr {
                            extract_strings(item, seen, alts, main_text);
                        }
                    }
                    _ => {}
                }
            }

            if let Some(extra) = body.get(6).or_else(|| body.get(4)) {
                extract_strings(extra, &mut seen, &mut alts, &translated_text);
            }

            alts
        };

        Ok(TranslateResponse {
            translated_text,
            detected_language,
            alternatives,
        })
    }

    async fn validate(_client: &reqwest::Client, _api_key: &str) -> Result<bool, String> {
        Ok(true)
    }
}

// bing

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BingResponseItem {
    translations: Vec<BingTranslation>,
    detected_language: Option<BingDetectedLanguage>,
}

#[derive(Deserialize)]
struct BingTranslation {
    text: String,
}

#[derive(Deserialize)]
struct BingDetectedLanguage {
    language: String,
}

impl TranslationProvider for Bing {
    async fn translate(
        client: &reqwest::Client,
        req: &TranslateRequest,
    ) -> Result<TranslateResponse, String> {
        let token = client
            .get("https://edge.microsoft.com/translate/auth")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")
            .send()
            .await
            .map_err(|e| format!("Failed to get Bing auth token: {}", e))?
            .text()
            .await
            .map_err(|e| format!("Failed to read Bing auth token: {}", e))?;

        let mut url = format!(
            "https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to={}",
            req.to
        );
        if req.from != "auto" {
            url.push_str(&format!("&from={}", req.from));
        }

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token.trim()))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!([{"Text": req.text}]))
            .send()
            .await
            .map_err(|e| format!("Bing request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Bing API error ({}): {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        let items: Vec<BingResponseItem> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Bing response: {}", e))?;
        let item = items.first().ok_or("No data in Bing response")?;
        let translation = item
            .translations
            .first()
            .ok_or("No translation found in Bing response")?;

        Ok(TranslateResponse {
            translated_text: translation.text.clone(),
            detected_language: item
                .detected_language
                .as_ref()
                .map(|d| d.language.to_lowercase()),
            alternatives: Vec::new(),
        })
    }

    async fn validate(_client: &reqwest::Client, _api_key: &str) -> Result<bool, String> {
        Ok(true)
    }
}

// lara

#[derive(Deserialize)]
struct LaraResponse {
    translation: Option<String>,
    detected_language: Option<String>,
    data: Option<LaraData>,
}

#[derive(Deserialize)]
struct LaraData {
    translation: Option<String>,
    detected_language: Option<String>,
}

impl TranslationProvider for Lara {
    async fn translate(
        client: &reqwest::Client,
        req: &TranslateRequest,
    ) -> Result<TranslateResponse, String> {
        let mut body = serde_json::json!({ "text": req.text, "target": req.to });
        if req.from != "auto" {
            body["source"] = serde_json::json!(req.from);
        }

        let response = client
            .post("https://api.laratranslate.com/v2/translate")
            .header("Authorization", format!("Bearer {}", req.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Lara request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Lara API error ({}): {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        let body: LaraResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Lara response: {}", e))?;
        let translated = body
            .translation
            .or_else(|| body.data.as_ref().and_then(|d| d.translation.clone()))
            .ok_or("No translation found")?;

        Ok(TranslateResponse {
            translated_text: translated,
            detected_language: body
                .detected_language
                .or_else(|| body.data.as_ref().and_then(|d| d.detected_language.clone()))
                .map(|s| s.to_lowercase()),
            alternatives: Vec::new(),
        })
    }

    async fn validate(_client: &reqwest::Client, api_key: &str) -> Result<bool, String> {
        Ok(api_key.trim().len() >= 10)
    }
}
