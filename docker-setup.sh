
# Use 
docker -d

sleep 10

docker run -i -t  -P --name postgres -d nachiket/postgres

docker run --name apache_borrowed -p 80:80 -p 443:443 -d eboraas/apache

docker run -P -ti --link postgres:postgres -d --link apache_borrowed:apache --name noit nachiket/noit