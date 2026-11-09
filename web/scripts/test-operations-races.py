"""Two independent psql connections, against isolated local fixtures only."""
import json, os, subprocess, uuid
url = os.environ['DB_URL']
args = ['psql', url, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
def run(sql):
    return subprocess.run(args,input=sql,text=True,capture_output=True,check=True).stdout.strip()
def jwt(role='authenticated', user=None):
    claims=json.dumps(dict(role=role,**({'sub':user} if user else {})))
    return "select set_config('request.jwt.claims','"+claims+"',false);set role "+role+";"
def race(sql1,sql2):
    a=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    b=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    a.stdin.write(sql1);a.stdin.close();b.stdin.write(sql2);b.stdin.close()
    out=[]
    for p in [a,b]:
        stdout=p.stdout.read();stderr=p.stderr.read();code=p.wait()
        if code:raise RuntimeError(stderr)
        out.append(stdout.strip().splitlines()[-1])
    return out
staff=str(uuid.uuid4());quote=str(uuid.uuid4());key=str(uuid.uuid4());job=str(uuid.uuid4())
run(f"insert into auth.users(id,email) values('{staff}','race@example.invalid');insert into staff_roles(user_id,role) values('{staff}','operations');insert into quotes(id,title,email,package,price,valid_until) values('{quote}','TEST_RACE','fixture@example.invalid','Pro',1200,current_date+1);")
run(jwt(user=staff)+f"select mark_quote_sent('{quote}','e-posta');")
sql=jwt(user=staff)+f"begin;select accept_quote('{quote}')::text;select pg_sleep(0.25);commit;"
# Keep final output as JSON despite commit/sleep.
a,b=race(sql.replace('select pg_sleep(0.25);commit;',f"select pg_sleep(0.25);commit;select jsonb_build_object('customer_id',customer_id,'contract_id',contract_id)::text from quote_acceptances where quote_id='{quote}';"),jwt(user=staff)+f"select accept_quote('{quote}')::text;")
a,b=json.loads(a),json.loads(b)
assert a['customer_id']==b['customer_id'] and a['contract_id']==b['contract_id']
customer=a['customer_id'];contract=a['contract_id']
counts=run(f"select (select count(*) from contracts where id='{contract}'),(select count(*) from invoices where contract_id='{contract}'),(select count(*) from operation_jobs where contract_id='{contract}');")
assert counts=='1|1|1',counts
print('PASS: concurrent quote acceptance -> one customer/contract/invoice/job')
sql=jwt(user=staff)+f"select receive_mail('{key}','{customer}','kargo')::text;"
a,b=map(json.loads,race(sql,sql));assert a['mail_id']==b['mail_id']
assert run(f"select count(*) from mail_items where intake_key='{key}';")=='1'
print('PASS: concurrent cargo intake -> one cargo and one notice')
job_id=run(f"select id from operation_jobs where contract_id='{contract}';")
sql=jwt('service_role')+f"select coalesce((select claim_token::text from operation_claim('{job_id}')),'none');"
a,b=race(sql,sql);assert (a=='none') != (b=='none')
print('PASS: concurrent outbox ownership -> exactly one claimant')
invoice=run(f"select id from invoices where contract_id='{contract}';")
sql=jwt(user=staff)+f"select mark_invoice_paid_manual('{invoice}',current_date,'havale',1200,'TEST-RACE-PAY');select status from invoices where id='{invoice}';"
a,b=race(sql,sql);assert a==b=='ödendi'
assert run(f"select count(*) from operation_jobs where invoice_id='{invoice}' and kind='einvoice_issue';")=='1'
print('PASS: concurrent same-payment confirmation -> one fiscal job')
