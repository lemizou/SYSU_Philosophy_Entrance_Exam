import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "202608110001_initial_user_backend.sql"
HARDENING_MIGRATION = (
    ROOT / "supabase" / "migrations" / "202608110002_harden_existing_rls_trigger.sql"
)
ENV_EXAMPLE = ROOT / ".env.example"


class SupabaseBackendMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_expected_tables_are_created(self) -> None:
        for table in (
            "public.favorites",
            "public.notes",
            "public.recent_views",
            "public.daily_user_activity",
            "private.admin_users",
        ):
            self.assertIn(f"create table {table}", self.sql)

    def test_all_user_tables_enable_rls(self) -> None:
        for table in (
            "public.favorites",
            "public.notes",
            "public.recent_views",
            "public.daily_user_activity",
        ):
            self.assertIn(f"alter table {table} enable row level security", self.sql)

    def test_sensitive_writes_use_server_side_rpcs(self) -> None:
        self.assertIn("create or replace function public.record_recent_view", self.sql)
        self.assertIn("create or replace function public.record_activity", self.sql)
        self.assertNotIn("grant insert on public.recent_views", self.sql)
        self.assertNotIn("grant insert on public.daily_user_activity", self.sql)

    def test_security_definer_functions_pin_search_path(self) -> None:
        definitions = re.findall(
            r"create or replace function public\.(record_recent_view|record_activity|get_activity_metrics).*?\$\$;",
            self.sql,
            flags=re.DOTALL,
        )
        self.assertEqual(
            set(definitions),
            {"record_recent_view", "record_activity", "get_activity_metrics"},
        )
        for function_name in definitions:
            start = self.sql.index(f"create or replace function public.{function_name}")
            end = self.sql.index("$$;", start)
            definition = self.sql[start:end]
            self.assertIn("security definer", definition)
            self.assertIn("set search_path = ''", definition)

    def test_public_and_anon_rpc_access_is_revoked(self) -> None:
        for signature in (
            "public.record_recent_view(text)",
            "public.record_activity()",
            "public.get_my_stats()",
            "public.export_my_notes()",
            "public.get_activity_metrics(date)",
        ):
            self.assertIn(
                f"revoke all on function {signature} from public, anon",
                self.sql,
            )

    def test_example_env_contains_no_secret_key_slot(self) -> None:
        env_text = ENV_EXAMPLE.read_text(encoding="utf-8")
        assignments = {
            line.split("=", 1)[0]
            for line in env_text.splitlines()
            if line and not line.startswith("#") and "=" in line
        }
        self.assertEqual(
            assignments,
            {"SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"},
        )

    def test_existing_rls_helper_is_not_browser_callable(self) -> None:
        hardening_sql = HARDENING_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("to_regprocedure('public.rls_auto_enable()')", hardening_sql)
        self.assertIn(
            "revoke all on function public.rls_auto_enable() from public, anon, authenticated",
            hardening_sql,
        )


if __name__ == "__main__":
    unittest.main()
