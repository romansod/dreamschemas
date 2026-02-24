/**
 * API Route: Upload file to user's Supabase project storage
 * Uses Supabase Management API with user's OAuth token
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const filePath = formData.get("filePath") as string;

    if (!file || !projectId || !filePath) {
      return NextResponse.json(
        { error: "File, project ID, and file path are required" },
        { status: 400 }
      );
    }

    // Get OAuth token from Authorization header
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required. Please provide a valid access token." },
        { status: 401 }
      );
    }

    // Get service role key provided directly by the user
    const serviceRoleKey = request.headers.get('x-service-role-key');

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Service role key is required" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Upload file using project's Storage API (service role key for bypassing RLS)
    const uploadResponse = await fetch(
      `https://${projectId}.supabase.co/storage/v1/object/csv-uploads/${filePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': file.type || 'text/csv',
        },
        body: buffer,
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error("Failed to upload file:", error);
      return NextResponse.json(
        { error: `Failed to upload file: ${error}` },
        { status: uploadResponse.status }
      );
    }

    const uploadData = await uploadResponse.json();
    console.log("Successfully uploaded file:", uploadData);

    return NextResponse.json({
      success: true,
      message: "File uploaded successfully",
      filePath,
      data: uploadData
    });

  } catch (error) {
    console.error("Error in file upload:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
} 