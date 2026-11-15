import subprocess,json
from spec import *
def q(sql):
    r=subprocess.run(['psql','-h','/tmp/pgtest','-p','5544','-U','postgres','-d','scaleup_final','-At','-F','|','-c',sql],capture_output=True,text=True,check=True); return [l.split('|') for l in r.stdout.strip().splitlines()]
# columns
rows=q("""select table_name,column_name,case when data_type='character varying' then 'VARCHAR('||character_maximum_length||')'
 when data_type='character' then 'CHAR('||character_maximum_length||')' when data_type='numeric' then 'NUMERIC('||numeric_precision||','||numeric_scale||')'
 when data_type='timestamp with time zone' then 'TIMESTAMPTZ' when data_type='integer' then 'INTEGER' when data_type='bigint' then 'BIGINT'
 when data_type='smallint' then 'SMALLINT' when data_type='uuid' then 'UUID' when data_type='date' then 'DATE' when data_type='text' then 'TEXT' when data_type='jsonb' then 'JSONB' else data_type end,
 is_nullable from information_schema.columns where table_schema='public'""")
db={(t,c):(ty,n=='YES') for t,c,ty,n in rows}
bad=0; cnt=0
for t,d in T.items():
    for n,ty,null,_,k in d['cols']:
        cnt+=1
        got=db.get((t,n))
        if got!=(ty,null): print('MISMATCH',t,n,ty,null,got); bad+=1
extra=set(db)-{(t,c[0]) for t,d in T.items() for c in d['cols']}
print('columns checked',cnt,'mismatches',bad,'extra in db',extra)
fk=q("select conrelid::regclass, a.attname, confrelid::regclass from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where contype='f' and connamespace='public'::regnamespace")
dbfk={(a,b):c for a,b,c in fk}
print('fks db',len(dbfk),'spec',len(FK),'equal',dbfk=={k:v for k,v in FK.items()})
pk=q("select conrelid::regclass, a.attname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where contype='p' and connamespace='public'::regnamespace")
print('pks',len(pk),'every table has pk',len(pk)==len(T))
