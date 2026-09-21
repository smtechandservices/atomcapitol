from django.contrib import admin

from .models import Plot, PlotAssignmentHistory, Project, ProjectImage


class ProjectImageInline(admin.TabularInline):
    model = ProjectImage
    extra = 1


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "location", "development_status", "is_published")
    list_filter = ("development_status", "is_published")
    search_fields = ("name", "location")
    inlines = [ProjectImageInline]


@admin.register(Plot)
class PlotAdmin(admin.ModelAdmin):
    list_display = ("project", "plot_number", "status", "total_value", "instalment_count")
    list_filter = ("status", "project")
    search_fields = ("plot_number",)


@admin.register(PlotAssignmentHistory)
class PlotAssignmentHistoryAdmin(admin.ModelAdmin):
    list_display = ("plot", "action", "from_email", "to_email", "created_at")
    readonly_fields = [f.name for f in PlotAssignmentHistory._meta.fields]
