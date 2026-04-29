/**
 * Utility script to list available models from Google AI Studio
 * Usage: bun src/utils/list-models.ts
 */

async function listAvailableModels() {
  const API_KEY = process.env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  const URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

  try {
    console.log('📡 Fetching available models from Google AI Studio...\n');
    
    const response = await fetch(URL);
    const data = await response.json();
    
    if (!data.models) {
      console.error('❌ No models found in response:', data);
      return;
    }

    console.log('✅ --- All Available Models ---\n');
    
    const gemmaModels = data.models.filter((m: any) => 
      m.name?.toLowerCase().includes('gemma') || 
      m.displayName?.toLowerCase().includes('gemma')
    );

    if (gemmaModels.length > 0) {
      console.log('🔮 GEMMA MODELS:');
      gemmaModels.forEach((m: any) => {
        console.log(`   • ${m.name}`);
        console.log(`     Display: ${m.displayName}`);
        if (m.description) console.log(`     Description: ${m.description}`);
        console.log('');
      });
    }

    const otherModels = data.models.filter((m: any) => 
      !m.name?.toLowerCase().includes('gemma') && 
      !m.displayName?.toLowerCase().includes('gemma')
    );

    if (otherModels.length > 0) {
      console.log('\n📊 OTHER AVAILABLE MODELS:');
      otherModels.forEach((m: any) => {
        console.log(`   • ${m.name}`);
        console.log(`     Display: ${m.displayName}`);
      });
    }

    console.log(`\n📈 Total Models: ${data.models.length}`);
    console.log(`🔮 Gemma Models: ${gemmaModels.length}`);

  } catch (err) {
    console.error('❌ Error listing models:', err);
    process.exit(1);
  }
}

listAvailableModels();
