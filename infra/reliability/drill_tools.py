"""Runs inside the isolated ops container; uses only ephemeral fixture credentials."""
import json
import os
from pathlib import Path
import sys
import uuid
import backup

def main():
    # Fixture-only diagnostics; all values in this runner are synthetic.
    import subprocess
    def fixture_run(args, **kwargs):
        result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=1800,**kwargs)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace').replace('issue88-db-fixture','<redacted>'))
        return result
    backup.run=fixture_run
    action=sys.argv[1]
    if action=='seed':
        client=backup.s3(); bucket=os.environ['BACKUP_BUCKET']; client.create_bucket(Bucket=bucket)
        for variant in ['original','medium','thumbnail','step']:
            # Small real PNG, fixture only; metadata restored separately from content checksum.
            import base64
            data=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
            client.put_object(Bucket=bucket,Key='recipes/fixture/'+variant+'.png',Body=data,ContentType='image/png',Metadata={'variant':variant})
        with backup.db_connection() as connection:
            with connection.cursor() as cur:
                cur.execute('SELECT "Id" FROM "Recipes" LIMIT 1'); recipe=cur.fetchone()[0]
                origin=os.environ['BACKUP_S3_ENDPOINT']+'/'+bucket+'/recipes/fixture/'
                cur.execute('''INSERT INTO "RecipeImages" ("Id","RecipeId","OriginalUrl","MediumUrl","ThumbnailUrl","AltText","IsPrimary","OrderIndex","ProcessingStatus","CreatedAt","IsDeleted","RowVersion")
                    VALUES (%s,%s,%s,%s,%s,'Fixture',true,0,'Completed',now(),false,%s)''',
                    (uuid.uuid4(),recipe,origin+'original.png',origin+'medium.png',origin+'thumbnail.png',b'fixture'))
                cur.execute('UPDATE "RecipeSteps" SET "ImageUrl"=%s',(origin+'step.png',))
        backup.run(['age-keygen','-o','/backups/identity.txt'])
        recipient=backup.run(['age-keygen','-y','/backups/identity.txt']).stdout.decode().strip()
        Path('/backups/recipient').write_text(recipient)
        print('Fixture objects and metadata seeded')
    elif action=='backup':
        os.environ['BACKUP_AGE_RECIPIENT']=Path('/backups/recipient').read_text()
        identity=backup.backup(Path('/backups')); Path('/backups/latest').write_text(identity)
    elif action=='restore':
        backup.restore(Path('/backups'),Path('/backups/latest').read_text())
    elif action=='verify':
        summary=json.loads(next(p for p in Path('/backups').glob('backup-*.json')).read_text())
        with backup.db_connection() as connection: assert backup.inventory(connection)==summary['tables']
        import io, tarfile, hashlib
        archive=backup.run(['age','-d','-i','/backups/identity.txt','/backups/'+summary['id']+'.age']).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar: manifest=json.load(tar.extractfile('manifest.json'))
        client=backup.s3()
        assert len(client.list_objects_v2(Bucket=os.environ['BACKUP_BUCKET'])['Contents'])==len(manifest['objects'])
        for item in manifest['objects']:
            response=client.get_object(Bucket=os.environ['BACKUP_BUCKET'],Key=item['key'])
            assert hashlib.sha256(response['Body'].read()).hexdigest()==item['sha256']
            response['Body'].close()
            assert response['ContentLength']==item['size'] and response['Metadata']==item['metadata'] and response['ContentType']==item['content_type']
        print('Persistent DB/Hangfire/object digests match')
    elif action=='corrupt':
        path=Path('/backups')/(Path('/backups/latest').read_text()+'.age')
        with open(path,'ab') as stream: stream.write(b'corruption')
    elif action=='failure':
        os.environ['BACKUP_DSN']='host=127.0.0.1 port=1 dbname=postgres user=invalid connect_timeout=1'
        try: backup.backup(Path('/backups'))
        except Exception: pass
        else: raise AssertionError('Backup failure not detected')
        assert json.loads(Path('/backups/status.json').read_text())['failed']==1
        assert list(Path('/backups').glob('*.age'))
        print('Backup failure recorded; last good backup retained')

if __name__=='__main__': main()
