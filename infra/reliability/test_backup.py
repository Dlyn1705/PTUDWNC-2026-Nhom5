import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import backup

class BackupRules(unittest.TestCase):
    def test_utc_schedule(self):
        for hour,day in [(2,1),(3,2),(23,2)]:
            self.assertEqual(backup.next_run(dt.datetime(2026,1,1,hour,tzinfo=backup.UTC)),dt.datetime(2026,1,day,3,tzinfo=backup.UTC))

    def test_retention_keeps_boundary_latest_and_unfinished(self):
        clock=dt.datetime(2026,6,1,tzinfo=backup.UTC)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for days in [29,30,31]:
                name=f'backup-20260501T030000Z-{days:08x}'
                (root/(name+'.age')).write_bytes(b'encrypted')
                (root/(name+'.json')).write_text(json.dumps({'complete':True,'completed_at':(clock-dt.timedelta(days=days)).isoformat()}))
            (root/'unfinished.partial').write_bytes(b'keep')
            backup.prune(root,clock)
            self.assertEqual(len(list(root.glob('*.age'))),2)
            self.assertTrue((root/'unfinished.partial').exists())
            # Even an old last good backup is retained.
            backup.prune(root,clock+dt.timedelta(days=100))
            self.assertEqual(len(list(root.glob('*.age'))),1)

    def test_failure_sets_metric_alerts_and_resumes_without_prune(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backup,'hook') as hook, patch.object(backup,'run',side_effect=RuntimeError()), patch.object(backup,'alert') as alert, patch.object(backup,'prune') as prune:
            with patch.dict('os.environ',{'BACKUP_DSN':'host=unused dbname=unused'}):
                with self.assertRaises(RuntimeError): backup.backup(Path(directory))
            self.assertEqual(json.loads((Path(directory)/'status.json').read_text())['failed'],1)
            alert.assert_called_once(); prune.assert_not_called(); self.assertEqual(hook.call_args_list[-1].args[0],'BACKUP_RESUME_COMMAND')

    def test_restore_rejects_nonisolated_targets_before_io(self):
        with patch.dict('os.environ',{'RESTORE_DSN':'dbname=culinary_blog_db','RESTORE_BUCKET':'production'}):
            with self.assertRaises(ValueError): backup.restore(Path('/missing'),'backup-20260501T030000Z-abcdef01')

    def test_parallel_backup_lock_rejects_second_writer(self):
        with tempfile.TemporaryDirectory() as directory, backup.locked(Path(directory)):
            with self.assertRaises(BlockingIOError):
                with backup.locked(Path(directory)): pass

    def test_libpq_credentials_not_misinterpreted_as_database_name(self):
        env=backup.libpq_environment('host=db port=5432 dbname=fixture user=backup password=fixture-secret sslmode=require connect_timeout=5')
        self.assertEqual(env['PGHOST'],'db'); self.assertEqual(env['PGDATABASE'],'fixture')
        self.assertEqual(env['PGSSLMODE'],'require'); self.assertEqual(env['PGCONNECT_TIMEOUT'],'5')

if __name__=='__main__': unittest.main()
