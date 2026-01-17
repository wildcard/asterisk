/**
 * LLM Integration for Field Analysis
 *
 * Uses Claude API to analyze ambiguous form fields and suggest vault matches.
 */

use serde::{Deserialize, Serialize};

/// Request for LLM field analysis
#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeFieldRequest {
    pub label: String,
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub placeholder: Option<String>,
    pub semantic: Option<String>,
    pub available_keys: Vec<String>,
}

/// Response from LLM field analysis
#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyzeFieldResponse {
    pub vault_key: Option<String>,
    pub confidence: f64,
    pub reasoning: String,
}

/// Claude API message structure
#[derive(Debug, Serialize, Deserialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Claude API request body
#[derive(Debug, Serialize, Deserialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeMessage>,
}

/// Claude API response
#[derive(Debug, Serialize, Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClaudeContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

/// Analyze a field using Claude API
pub async fn analyze_field_with_llm(
    request: AnalyzeFieldRequest,
    api_key: &str,
) -> Result<AnalyzeFieldResponse, String> {
    // Build the prompt
    let prompt = build_prompt(&request);

    // Call Claude API
    let client = reqwest::Client::new();
    let claude_request = ClaudeRequest {
        model: "claude-sonnet-4-20250514".to_string(),
        max_tokens: 256,
        messages: vec![ClaudeMessage {
            role: "user".to_string(),
            content: prompt,
        }],
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&claude_request)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API returned {}: {}", status, body));
    }

    let claude_response: ClaudeResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    // Parse the response
    let text = claude_response
        .content
        .first()
        .map(|c| c.text.as_str())
        .unwrap_or("");

    parse_llm_response(text, &request.available_keys)
}

/// Build the prompt for Claude API
fn build_prompt(request: &AnalyzeFieldRequest) -> String {
    let available_keys = request.available_keys.join(", ");

    format!(
        r#"You are analyzing a form field to determine which user data it expects.

Field information:
- Label: "{}"
- Name attribute: "{}"
- Input type: "{}"
- Placeholder: {}
- Semantic hint: {}

Available vault data keys:
{}

Task: Determine which vault key (if any) should be used to fill this field.

Respond ONLY with valid JSON in this exact format:
{{"vaultKey": "keyName", "confidence": 0.85, "reasoning": "explanation"}}

Or if no match:
{{"vaultKey": null, "confidence": 0.0, "reasoning": "explanation"}}

Confidence scale:
- 0.80-0.90: Strong semantic match
- 0.60-0.80: Likely match but some ambiguity
- 0.40-0.60: Possible match, low confidence
- 0.0-0.40: No clear match

If no vault key matches, set vaultKey to null. Be conservative with confidence scores."#,
        request.label,
        request.name,
        request.field_type,
        request.placeholder.as_deref().unwrap_or("(none)"),
        request.semantic.as_deref().unwrap_or("unknown"),
        available_keys
    )
}

/// Parse LLM response into structured data
fn parse_llm_response(
    text: &str,
    available_keys: &[String],
) -> Result<AnalyzeFieldResponse, String> {
    // Try to parse as JSON
    let parsed: serde_json::Value = serde_json::from_str(text.trim())
        .map_err(|e| format!("Failed to parse LLM response as JSON: {}", e))?;

    let vault_key = parsed
        .get("vaultKey")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Validate vault_key exists in available keys
    let vault_key = if let Some(key) = vault_key {
        if available_keys.contains(&key) {
            Some(key)
        } else {
            eprintln!(
                "LLM suggested key '{}' not in available keys: {:?}",
                key, available_keys
            );
            None
        }
    } else {
        None
    };

    let confidence = parsed
        .get("confidence")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let reasoning = parsed
        .get("reasoning")
        .and_then(|v| v.as_str())
        .unwrap_or("No reasoning provided")
        .to_string();

    Ok(AnalyzeFieldResponse {
        vault_key,
        confidence,
        reasoning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_prompt() {
        let request = AnalyzeFieldRequest {
            label: "Company Name".to_string(),
            name: "company".to_string(),
            field_type: "text".to_string(),
            placeholder: Some("e.g., Acme Corp".to_string()),
            semantic: Some("unknown".to_string()),
            available_keys: vec!["firstName".to_string(), "company".to_string()],
        };

        let prompt = build_prompt(&request);
        assert!(prompt.contains("Company Name"));
        assert!(prompt.contains("firstName, company"));
    }

    #[test]
    fn test_parse_llm_response_with_match() {
        let json = r#"{"vaultKey": "email", "confidence": 0.85, "reasoning": "Field label indicates email address"}"#;
        let available_keys = vec!["email".to_string(), "phone".to_string()];

        let result = parse_llm_response(json, &available_keys).unwrap();
        assert_eq!(result.vault_key, Some("email".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_parse_llm_response_no_match() {
        let json = r#"{"vaultKey": null, "confidence": 0.0, "reasoning": "No clear match"}"#;
        let available_keys = vec!["email".to_string()];

        let result = parse_llm_response(json, &available_keys).unwrap();
        assert_eq!(result.vault_key, None);
        assert_eq!(result.confidence, 0.0);
    }

    #[test]
    fn test_parse_llm_response_invalid_key() {
        let json = r#"{"vaultKey": "nonexistent", "confidence": 0.85, "reasoning": "Test"}"#;
        let available_keys = vec!["email".to_string()];

        let result = parse_llm_response(json, &available_keys).unwrap();
        // Should reject invalid key
        assert_eq!(result.vault_key, None);
    }
}
