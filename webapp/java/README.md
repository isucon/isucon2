### SET UP ENVIRONMENT ###
* Java: <= 1.6 
 * http://www.oracle.com/technetwork/java/javase/downloads/index.html
* Tomcat: <= 6.0
 * http://tomcat.apache.org/download-70.cgi
* Maven: 2.x
 * http://maven.apache.org/download.html 
* IDE: arbitrary(recommend you to use Eclipse 3.x)

### CONFIG TO CHANGE ###
* db env.
 * src/main/resources/{deploy.phase}/db.properties
 * src/main/resources/{deploy.phase}/data/datasource.xml
* view env.
 * src/main/resources/{deploy.phase}/view/view.xml

### HOW TO BUILD ###
* to local env.
$ cd {basedir}
$ mvn package

* to dev env.
$ mvn package -P dev

* to product env.
$ mvn package -P release

### HOW TO DEPLOY ###
$ cp {basedir}/target/isucon2.war {tomcat_dir}/webapps/ROOT.war
$ {tomcat_dir}/bin/startup.sh
