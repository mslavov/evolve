# Output Schema Templates

This directory contains predefined JSON schema templates that can be used to configure the output structure of the AI agent.

## Available Schemas

### classification.json
Used for categorizing content into predefined or dynamic categories.
- `category`: Primary classification
- `subcategories`: Additional classifications
- `confidence`: Classification confidence score
- `reasoning`: Explanation for the classification
- `tags`: Relevant tags

### extraction.json
Used for extracting structured information from unstructured text.
- `entities`: Named entities (people, places, organizations, etc.)
- `keyPoints`: Important facts or statements
- `relationships`: Connections between entities
- `metadata`: Additional extracted information

### sentiment.json
Used for analyzing emotional tone and sentiment.
- `sentiment`: Overall sentiment (positive/negative/neutral/mixed)
- `score`: Numerical sentiment score
- `emotions`: Detected emotions and intensities
- `aspects`: Aspect-based sentiment analysis
- `reasoning`: Explanation for the analysis

### qa.json
Used for question-answering tasks.
- `answer`: The main answer
- `confidence`: Answer confidence
- `sources`: Supporting evidence
- `alternativeAnswers`: Other possible answers
- `answerType`: Type of answer (factual/opinion/etc.)
- `followUpQuestions`: Suggested related questions

## Usage

### Using a schema file

```bash
# Use a schema from file
pnpm cli agent set myagent --name "My Agent" --type classifier --model gpt-4o --schema-file ./schemas/classification.json --prompt "Classify the following content:"

# Create your own schema
cp schemas/extraction.json my-custom-schema.json
# Edit my-custom-schema.json
pnpm cli agent set myagent --schema-file ./my-custom-schema.json
```

## Schema Format

Schemas are defined in JSON format that will be passed to the LLM for structured output generation:

```json
{
  "type": "object",
  "properties": {
    "fieldName": {
      "type": "string|number|boolean|array|object|record",
      "description": "Field description",
      "optional": true,
      "min": 0,
      "max": 100,
      "enum": ["option1", "option2"]
    }
  }
}
```

### Supported Types
- `string`: Text values
- `number`: Numeric values (supports min/max)
- `boolean`: True/false values
- `array`: Lists (requires `items` definition)
- `object`: Nested objects (requires `properties`)
- `record`: Key-value pairs
- `any`: Any type

### Field Options
- `description`: Describes the field's purpose
- `optional`: Makes the field optional
- `min`/`max`: For numbers and string lengths
- `enum`: For predefined options
- `items`: For array element types