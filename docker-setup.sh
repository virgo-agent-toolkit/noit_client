# mount /var/lib/docker with a tmpfs
mount -t tmpfs none /var/lib/docker

# enable ipv4 forwarding for docker
echo 1 > /proc/sys/net/ipv4/ip_forward

# configure networking
# ip addr add 127.0.0.1 dev lo
# ip link set lo up
# ip addr add 10.1.1.1/24 dev eth0
# ip link set eth0 up
# ip route add default via 10.1.1.254

# configure dns (google public)
#mkdir -p /run/resolvconf
#echo 'nameserver 8.8.8.8' > /run/resolvconf/resolv.conf
#mount --bind /run/resolvconf/resolv.conf /etc/resolv.conf

# Start docker daemon
docker -d &
sleep 5

docker run -i -t  -P --name postgres -d nachiket/postgres
docker run --name apache_borrowed -p 80:80 -p 443:443 -d eboraas/apache
docker run -p 32322:32322 -p 43191:43191 -p 8888:8888 -ti \
--link postgres:postgres --link apache_borrowed:apache -d --name noit nachiket/noit
