import { NextResponse } from "next/server";
import { verifyOtp } from "../../../../lib/db";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();
    if (!email || !otp) {
      return NextResponse.json({ message: "Email and OTP are required" }, { status: 400 });
    }
    
    const isValid = verifyOtp(email, otp);
    if (isValid) {
      return NextResponse.json({ success: true, email });
    } else {
      return NextResponse.json({ success: false, message: "Invalid or expired OTP" }, { status: 401 });
    }
  } catch (error) {
    console.error("Failed to verify OTP:", error);
    return NextResponse.json({ message: "Server error verifying OTP" }, { status: 500 });
  }
}
