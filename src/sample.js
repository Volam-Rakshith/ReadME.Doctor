/**
 * README Doctor — the bundled sample.
 *
 * A deliberately flawed README: it exercises many diagnostics at once.
 * Used by the "Try the sample" button and by the test-suite, which asserts
 * the expected findings against it (test/integration.test.js).
 */
export const SAMPLE_README = `# Awesome CLI

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://example.com/ci) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- Blazing fast file processing
- Configurable through environment variables
- Works on Linux, macOS and Windows

## Installation

Install globally with npm:

\`\`\`bash
npm install awesome-cli
\`\`\`

## Usage

Set the required variables, then run:

\`\`\`bash
export API_KEY=your-api-key
export AWS_REGION=us-east-1
awesome-cli run ./input.txt
\`\`\`

For all the flags see the [configuration reference](#configuration-options).

## Configuration

TODO: document the options

## Examples

More examples live in [examples/](./examples) and the [advanced guide](./docs/advanced.md).

## Contributing

PRs welcome

## Contact

Questions? Open an issue or visit https://support.invalid-example.com/help.
`;

export const SAMPLE_NAME = 'sample-readme.md';
