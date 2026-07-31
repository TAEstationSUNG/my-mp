// 서버 전용 Supabase 클라이언트 (Server Component에서만 사용).
// 읽기 전용 조회에 쓰며, 키는 서버에만 머문다(브라우저로 안 나감).
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(".env 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
