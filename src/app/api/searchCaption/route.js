import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request) {
  try {
    const { prompt } = await request.json();

    // Validate input
    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Construct the full input for the model
    const fullPrompt = `${prompt}`;

    // Call Hugging Face API
    const response = await fetch(
      "https://api-inference.huggingface.co/models/google/flan-t5-large",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: { 
            max_length: 100,
            temperature: 0.9,  // More creative outputs
            do_sample: true   // Better for casual content
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Hugging Face API error");
    }

    const [result] = await response.json();
    return NextResponse.json({ 
      caption: result.generated_text,
      prompt: fullPrompt  // Optional: return the constructed prompt
    });
    
  } catch (error) {
    console.error("Caption generation failed:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to generate caption",
        suggestion: "Try simplifying your prompt or check your API key"
      },
      { status: 500 }
    );
  }
}