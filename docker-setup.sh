docker run -i -t  -P --name postgres -d nachiket/postgres
docker run --name apache_borrowed -p 80:80 -p 443:443 -d eboraas/apache
docker run -p 32322:32322 -p 43191:43191 -p 8888:8888 -ti \
--link postgres:postgres --link apache_borrowed:apache -d --name noit nachiket/noit
