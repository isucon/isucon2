<h1>TOP</h1>
<ul>
    <#list artists as artist>
    <li><a href="/artist/${artist.id}"><span class="artist_name">${artist.name }</span></a></li>
    </#list>
</ul>
