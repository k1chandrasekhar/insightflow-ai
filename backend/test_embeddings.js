import { pipeline } from '@xenova/transformers';

async function test() {
  try {
    console.log('Loading embedding pipeline...');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    console.log('Generating embedding for text "test"...');
    const output = await extractor('test', { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    console.log('Embedding dimension:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));
    console.log('SUCCESS!');
  } catch (error) {
    console.error('Error during embedding generation:', error);
    process.exit(1);
  }
}

test();
